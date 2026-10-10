process.env.DB_NAME = "splitter_test";
process.env.DB_USER = "splitter_test";
process.env.DB_PASSWORD = "splitter_test";
process.env.DB_HOST = "127.0.0.1";
process.env.ACCESS_TOKEN_SECRET = "test-only-access-secret";
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { sequelize, User, GroupMember, ExpenseData, ExpenseSettlement, Session } = require("../config/dbconfig");
const expenseRoute = require("../routes/expenseRoute");

test("group balance and settlement routes reserve pending payments and apply confirmed payments", async (t) => {
    const originals = {
        findUser: User.findByPk,
        findSession: Session.findByPk,
        transaction: sequelize.transaction,
        findMembership: GroupMember.findOne,
        findMembers: GroupMember.findAll,
        findExpenses: ExpenseData.findAll,
        findSettlements: ExpenseSettlement.findAll,
        findPending: ExpenseSettlement.findOne,
        createSettlement: ExpenseSettlement.create,
        findSettlement: ExpenseSettlement.findByPk
    };
    const users = new Map([
        [7, { id: 7, name: "Alex" }],
        [8, { id: 8, name: "Blair" }],
        [9, { id: 9, name: "Casey" }]
    ]);
    const members = [7, 8].map((userId) => ({ userId, User: users.get(userId) }));
    const expenses = [{
        id: 1,
        amount: "100.00",
        paidBy: 7,
        members: [{ userId: 7, shareAmount: "40.00" }, { userId: 8, shareAmount: "60.00" }]
    }];
    const settlements = [];

    User.findByPk = async (id) => users.get(Number(id));
    Session.findByPk = async (id) => ({ id: Number(id), userId: Number(id), expires_at: new Date(Date.now() + 60_000) });
    sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } });
    GroupMember.findOne = async ({ where }) => (
        [7, 8].includes(Number(where.userId)) ? { userId: Number(where.userId), status: "accepted" } : null
    );
    GroupMember.findAll = async () => members;
    ExpenseData.findAll = async () => expenses;
    ExpenseSettlement.findAll = async () => settlements;
    ExpenseSettlement.findOne = async ({ where }) => settlements.find((settlement) => (
        settlement.group_id === where.group_id &&
        settlement.payer_id === where.payer_id &&
        settlement.receiver_id === where.receiver_id &&
        settlement.status === where.status
    )) || null;
    ExpenseSettlement.create = async (values) => {
        const settlement = {
            id: settlements.length + 1,
            ...values,
            createdAt: new Date(),
            payer: users.get(values.payer_id),
            receiver: users.get(values.receiver_id),
            save: async function save() { return this; }
        };
        settlements.push(settlement);
        return settlement;
    };
    ExpenseSettlement.findByPk = async (id) => settlements.find((settlement) => settlement.id === Number(id)) || null;
    t.after(() => {
        User.findByPk = originals.findUser;
        Session.findByPk = originals.findSession;
        sequelize.transaction = originals.transaction;
        GroupMember.findOne = originals.findMembership;
        GroupMember.findAll = originals.findMembers;
        ExpenseData.findAll = originals.findExpenses;
        ExpenseSettlement.findAll = originals.findSettlements;
        ExpenseSettlement.findOne = originals.findPending;
        ExpenseSettlement.create = originals.createSettlement;
        ExpenseSettlement.findByPk = originals.findSettlement;
    });

    const app = express();
    app.use(express.json());
    app.use("/expense-splitter", expenseRoute);
    const server = app.listen(0);
    t.after(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const authHeaders = (userId) => ({
        Authorization: `Bearer ${jwt.sign({ userId, session_id: userId }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "5m" })}`,
        "Content-Type": "application/json"
    });

    const initialBalances = await fetch(`${baseUrl}/expense-splitter/get-balances/42`, { headers: authHeaders(7) });
    assert.equal(initialBalances.status, 200);
    const initialPayload = await initialBalances.json();
    assert.deepEqual(initialPayload.balances.map(({ userId, totalPaid, totalOwed, balance }) => (
        { userId, totalPaid, totalOwed, balance }
    )), [
        { userId: 7, totalPaid: 100, totalOwed: 40, balance: 60 },
        { userId: 8, totalPaid: 0, totalOwed: 60, balance: -60 }
    ]);
    assert.deepEqual(initialPayload.suggestedSettlements, [{
        payer: { id: 8, name: "Blair" },
        receiver: { id: 7, name: "Alex" },
        amount: 60
    }]);

    const requestPayment = () => fetch(`${baseUrl}/expense-splitter/settle/42`, {
        method: "POST",
        headers: authHeaders(8),
        body: JSON.stringify({ receiverId: 7, amount: 60 })
    });
    const pendingResponse = await requestPayment();
    assert.equal(pendingResponse.status, 201);

    const pendingBalances = await fetch(`${baseUrl}/expense-splitter/get-balances/42`, { headers: authHeaders(8) });
    const pendingPayload = await pendingBalances.json();
    assert.equal(pendingPayload.balances.find(({ userId }) => userId === 8).balance, -60);
    assert.deepEqual(pendingPayload.suggestedSettlements, []);

    const rejectResponse = await fetch(`${baseUrl}/expense-splitter/settlements/1/respond`, {
        method: "POST",
        headers: authHeaders(7),
        body: JSON.stringify({ accept: false })
    });
    assert.equal(rejectResponse.status, 200);
    assert.equal(settlements[0].status, "rejected");
    const rejectedBalances = await fetch(`${baseUrl}/expense-splitter/get-balances/42`, { headers: authHeaders(8) });
    assert.deepEqual((await rejectedBalances.json()).suggestedSettlements, initialPayload.suggestedSettlements);

    const secondPending = await requestPayment();
    assert.equal(secondPending.status, 201);
    const confirmResponse = await fetch(`${baseUrl}/expense-splitter/settlements/2/respond`, {
        method: "POST",
        headers: authHeaders(7),
        body: JSON.stringify({ accept: true })
    });
    assert.equal(confirmResponse.status, 200);
    assert.equal(settlements[1].status, "completed");

    const settledBalances = await fetch(`${baseUrl}/expense-splitter/get-balances/42`, { headers: authHeaders(7) });
    const settledPayload = await settledBalances.json();
    assert.equal(settledPayload.balances.find(({ userId }) => userId === 7).balance, 0);
    assert.equal(settledPayload.balances.find(({ userId }) => userId === 8).balance, 0);
    assert.deepEqual(settledPayload.suggestedSettlements, []);
});
