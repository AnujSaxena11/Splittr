process.env.DB_NAME = "splitter_test";
process.env.DB_USER = "splitter_test";
process.env.DB_PASSWORD = "splitter_test";
process.env.DB_HOST = "127.0.0.1";
process.env.ACCESS_TOKEN_SECRET = "test-only-access-secret";
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const express = require("express");
const jwt = require("jsonwebtoken");
const { sequelize, User, GroupMember, ExpenseData, ExpenseMember, ExpenseSettlement, Session } = require("../config/dbconfig");
const selfRoute = require("../routes/selfExpenseRoute");
const expenseRoute = require("../routes/expenseRoute");
const reportRoute = require("../routes/reportRoute");

test("personal, group, and report routes validate and exchange expected payloads", async (t) => {
    assert.equal(ExpenseData.rawAttributes.groupId.field, "group_id");
    assert.equal(ExpenseData.rawAttributes.group_id, undefined);

    const originals = {
        findUser: User.findByPk,
        findSession: Session.findByPk,
        transaction: sequelize.transaction,
        findMembership: GroupMember.findOne,
        findMemberships: GroupMember.findAll,
        createExpense: ExpenseData.create,
        findExpense: ExpenseData.findOne,
        findExpenses: ExpenseData.findAll,
        findExpenseShares: ExpenseMember.findAll,
        createMember: ExpenseMember.create,
        findSettlements: ExpenseSettlement.findAll
    };
    const user = { id: 7, name: "Test User", email: "test@example.com" };
    const personalExpense = {
        id: 11,
        amount: "18.50",
        scope: "self",
        category: "Food",
        desc: "Lunch",
        paid_to: "Corner Market",
        paidBy: user.id,
        date: "2026-10-10"
    };
    const groupExpense = {
        id: 42,
        amount: "40.00",
        scope: "group",
        category: "Food",
        desc: "Dinner",
        date: "2026-10-10",
        groupId: 42,
        paidBy: user.id,
        splitType: "custom",
        paidByUser: { id: user.id, name: user.name, email: user.email },
        members: [{ userId: user.id, shareAmount: "25.00", user }],
        createdAt: new Date("2026-10-10T12:00:00Z")
    };
    const otherPaidGroupExpense = {
        ...groupExpense,
        id: 43,
        amount: "100.00",
        paidBy: 8,
        paidByUser: { id: 8, name: "Morgan Lee", email: "morgan@example.com" },
        members: [{ userId: user.id, shareAmount: "35.00", user }]
    };
    let insertedExpense = null;
    const insertedShares = [];
    let membershipStatus = "accepted";

    User.findByPk = async () => user;
    Session.findByPk = async (id) => ({ id: Number(id), userId: user.id, expires_at: new Date(Date.now() + 60_000) });
    sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } });
    GroupMember.findOne = async () => membershipStatus === "accepted" ? { status: "accepted" } : null;
    GroupMember.findAll = async () => [{ groupId: 42 }];
    ExpenseData.create = async (values) => {
        insertedExpense = values;
        return { id: 50, ...values };
    };
    ExpenseData.findOne = async ({ where }) => (
        Number(where.id) === personalExpense.id && where.paidBy === user.id ? personalExpense : null
    );
    ExpenseData.findAll = async ({ where }) => {
        if (where.scope === "self") return [personalExpense];
        if (where.scope === "group") return [groupExpense, otherPaidGroupExpense];
        if (where.groupId === 42) return [groupExpense];
        return [];
    };
    ExpenseMember.findAll = async ({ where, include }) => {
        assert.equal(where.userId, user.id);
        const groupIds = include[0].where.groupId[Op.in].map(Number);
        const range = include[0].where.date[Op.between];
        return [
            { shareAmount: "25.00", ExpenseDatum: groupExpense },
            { shareAmount: "35.00", ExpenseDatum: otherPaidGroupExpense }
        ].filter(({ ExpenseDatum }) => (
            groupIds.includes(ExpenseDatum.groupId) &&
            ExpenseDatum.date >= range[0] &&
            ExpenseDatum.date <= range[1]
        ));
    };
    ExpenseSettlement.findAll = async () => [{
        id: 73,
        payer_id: 7,
        receiver_id: 8,
        amount: "12.50",
        status: "completed",
        createdAt: new Date("2026-10-10T12:00:00Z"),
        payer: { id: 7, name: "Test User" },
        receiver: { id: 8, name: "Morgan Lee" }
    }];
    ExpenseMember.create = async (values) => {
        insertedShares.push(values);
        return values;
    };
    t.after(() => {
        User.findByPk = originals.findUser;
        Session.findByPk = originals.findSession;
        sequelize.transaction = originals.transaction;
        GroupMember.findOne = originals.findMembership;
        GroupMember.findAll = originals.findMemberships;
        ExpenseData.create = originals.createExpense;
        ExpenseData.findOne = originals.findExpense;
        ExpenseData.findAll = originals.findExpenses;
        ExpenseMember.findAll = originals.findExpenseShares;
        ExpenseMember.create = originals.createMember;
        ExpenseSettlement.findAll = originals.findSettlements;
    });

    const app = express();
    app.use(express.json());
    app.use("/self", selfRoute);
    app.use("/expense-splitter", expenseRoute);
    app.use("/reports", reportRoute);
    const server = app.listen(0);
    t.after(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const token = jwt.sign({ userId: user.id, session_id: 1 }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "5m" });
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const unauthorized = await fetch(`${baseUrl}/self/expenses`);
    assert.equal(unauthorized.status, 401);

    const invalidExpense = await fetch(`${baseUrl}/self/expense`, {
        method: "POST",
        headers,
        body: JSON.stringify({ amount: -2, category: "Food", paid_to: "Cafe" })
    });
    assert.equal(invalidExpense.status, 400);
    assert.match((await invalidExpense.json()).message, /positive/);

    const createdPersonal = await fetch(`${baseUrl}/self/expense`, {
        method: "POST",
        headers,
        body: JSON.stringify({ amount: 18.5, category: "Food", desc: "Lunch", paid_to: "Corner Market" })
    });
    assert.equal(createdPersonal.status, 201);
    assert.equal(insertedExpense.scope, "self");
    assert.equal(insertedExpense.paidBy, user.id);

    const listedPersonal = await fetch(`${baseUrl}/self/expenses`, { headers });
    assert.equal(listedPersonal.status, 200);
    assert.equal((await listedPersonal.json()).allExpenses[0].paid_to, "Corner Market");
    assert.equal((await fetch(`${baseUrl}/self/expense/11`, { headers })).status, 200);
    assert.equal((await fetch(`${baseUrl}/self/expense/999`, { headers })).status, 404);

    const createdGroup = await fetch(`${baseUrl}/expense-splitter/add-expense/42`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            title: "Dinner",
            amount: 40,
            splitType: "custom",
            splits: [{ userId: 7, amount: 25 }, { userId: 8, amount: 15 }]
        })
    });
    assert.equal(createdGroup.status, 201);
    assert.equal(insertedExpense.scope, "group");
    assert.equal(insertedExpense.groupId, 42);
    assert.deepEqual(insertedShares.map(({ userId, shareAmount }) => ({ userId, shareAmount })), [
        { userId: 7, shareAmount: 25 },
        { userId: 8, shareAmount: 15 }
    ]);

    insertedShares.length = 0;
    const equalSplit = await fetch(`${baseUrl}/expense-splitter/add-expense/42`, {
        method: "POST",
        headers,
        body: JSON.stringify({ title: "Taxi", amount: 20, splitType: "equal", participants: [7, 8] })
    });
    assert.equal(equalSplit.status, 201);
    assert.deepEqual(insertedShares.map(({ userId, shareAmount }) => ({ userId, shareAmount })), [
        { userId: 7, shareAmount: 10 },
        { userId: 8, shareAmount: 10 }
    ]);

    insertedShares.length = 0;
    const mismatchedSplit = await fetch(`${baseUrl}/expense-splitter/add-expense/42`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            title: "Dinner",
            amount: 40,
            splitType: "custom",
            splits: [{ userId: 7, amount: 20 }]
        })
    });
    assert.equal(mismatchedSplit.status, 400);
    assert.match((await mismatchedSplit.json()).message, /don't match total expense/);

    const listedGroup = await fetch(`${baseUrl}/expense-splitter/get-expenses/42`, { headers });
    assert.equal(listedGroup.status, 200);
    const groupPayload = await listedGroup.json();
    assert.equal(groupPayload.expenses[0].title, "Dinner");
    assert.equal(groupPayload.expenses[0].participants[0].shareAmount, 25);

    const listedSettlements = await fetch(`${baseUrl}/expense-splitter/get-settlements/42`, { headers });
    assert.equal(listedSettlements.status, 200);
    const settlementPayload = await listedSettlements.json();
    assert.deepEqual(settlementPayload.settlements[0], {
        id: 73,
        payer: { id: 7, name: "Test User" },
        receiver: { id: 8, name: "Morgan Lee" },
        amount: 12.5,
        status: "completed",
        date: "2026-10-10T12:00:00.000Z"
    });

    membershipStatus = "pending";
    const pendingMemberResponse = await fetch(`${baseUrl}/expense-splitter/get-expenses/42`, { headers });
    assert.equal(pendingMemberResponse.status, 403);
    const pendingSettlementResponse = await fetch(`${baseUrl}/expense-splitter/get-settlements/42`, { headers });
    assert.equal(pendingSettlementResponse.status, 403);

    const report = await fetch(`${baseUrl}/reports/expenses?type=monthly&year=2026&month=10`, { headers });
    assert.equal(report.status, 200);
    const reportPayload = await report.json();
    assert.equal(reportPayload.reportInfo.type, "monthly");
    assert.equal(reportPayload.reportInfo.scope, "self");
    assert.equal(reportPayload.summary.totalSpent, 18.5);
    assert.equal(reportPayload.dailyTrend.length, 31);

    const groupReport = await fetch(`${baseUrl}/reports/expenses?type=monthly&year=2026&month=10&scope=group&groupId=42`, { headers });
    assert.equal(groupReport.status, 200);
    const groupReportPayload = await groupReport.json();
    assert.equal(groupReportPayload.reportInfo.scope, "group");
    assert.equal(groupReportPayload.reportInfo.groupId, 42);
    assert.equal(groupReportPayload.summary.totalSpent, 60);
    assert.notEqual(groupReportPayload.summary.totalSpent, reportPayload.summary.totalSpent);
    assert.equal(groupReportPayload.summary.transactionCount, 2);
    assert.equal(groupReportPayload.topExpenses.find((expense) => expense.id === 42).amount, 25);
    assert.equal(groupReportPayload.topExpenses.find((expense) => expense.id === 43).amount, 35);

    const allGroupsReport = await fetch(`${baseUrl}/reports/expenses?type=monthly&year=2026&month=10&scope=group&groupId=all`, { headers });
    assert.equal(allGroupsReport.status, 200);
    assert.equal((await allGroupsReport.json()).summary.totalSpent, 60);

    const unavailableGroupReport = await fetch(`${baseUrl}/reports/expenses?type=monthly&year=2026&month=10&scope=group&groupId=99`, { headers });
    assert.equal(unavailableGroupReport.status, 403);

    const invalidReport = await fetch(`${baseUrl}/reports/expenses?type=monthly&year=2026&month=13`, { headers });
    assert.equal(invalidReport.status, 400);
});
