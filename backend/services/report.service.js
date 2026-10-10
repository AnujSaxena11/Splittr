const { Op } = require("sequelize");
const { ExpenseData, ExpenseMember, GroupMember } = require("../config/dbconfig");
const { resolveDateRange, getPreviousDateRange } = require("../utils/dateRange");
const { analyzeReport } = require("./reportAnalysis.service");

const VALID_CATEGORIES = ["Food", "Shopping", "Education", "Friend", "EMI", "Bills", "Others"];

async function getExpenses(userId, range, category) {
    const where = { 
        scope: "self",
        paidBy: userId,
        date: { [Op.between]: [range.startDate, range.endDate] } 
    };

    if (category) where.category = category;

    return ExpenseData.findAll({
        where, 
        order: [["date", "ASC"], ["id", "ASC"]], 
        attributes: ["id", "amount", "category", "desc", "date"]
    });
}

async function getGroupExpenses(userId, groupIds, range, category) {
    const expenseWhere = {
        scope: "group",
        groupId: { [Op.in]: groupIds },
        date: { [Op.between]: [range.startDate, range.endDate] }
    };
    if (category) expenseWhere.category = category;

    const shares = await ExpenseMember.findAll({
        where: { userId },
        attributes: ["shareAmount"],
        order: [[ExpenseData, "date", "ASC"], [ExpenseData, "id", "ASC"]],
        include: [{
            model: ExpenseData,
            required: true,
            where: expenseWhere,
            attributes: ["id", "category", "desc", "date", "groupId"]
        }]
    });

    return shares.map((share) => {
        const value = share.get ? share.get({ plain: true }) : share;
        const expense = value.ExpenseDatum || value.ExpenseData;
        return {
            ...expense,
            amount: Math.round(Number(value.shareAmount) * 100) / 100
        };
    });
}

async function generateReport(userId, query) {
    const range = resolveDateRange(query);
    const previousRange = getPreviousDateRange(query.type, range);

    const category = query.category || null;
    const scope = query.scope || "self";

    if (query.type === "category" && !category) throw new Error("Category is required");

    if (category && !VALID_CATEGORIES.includes(category)) throw new Error("Unknown category");

    if (!["self", "group"].includes(scope)) throw new Error("Invalid report scope");

    let expenses;
    let previousExpenses;
    let reportInfo = {
        type: query.type,
        scope,
        startDate: range.startDate,
        endDate: range.endDate
    };

    if (scope === "self") {
        [expenses, previousExpenses] = await Promise.all([
            getExpenses(userId, range, category),
            getExpenses(userId, previousRange, category)
        ]);
    } else {
        const memberships = await GroupMember.findAll({
            where: { userId, status: "accepted" },
            attributes: ["groupId"]
        });
        const acceptedGroupIds = memberships.map((membership) => Number(membership.groupId));
        const allGroups = query.groupId === "all";
        const requestedGroupId = Number(query.groupId);
        if (!allGroups && (!Number.isSafeInteger(requestedGroupId) || requestedGroupId <= 0)) {
            throw new Error("A valid group or all groups must be selected");
        }
        if (!allGroups && !acceptedGroupIds.includes(requestedGroupId)) {
            const error = new Error("You are not an accepted member of this group");
            error.status = 403;
            throw error;
        }
        const groupIds = allGroups ? acceptedGroupIds : [requestedGroupId];
        [expenses, previousExpenses] = groupIds.length
            ? await Promise.all([
                getGroupExpenses(userId, groupIds, range, category),
                getGroupExpenses(userId, groupIds, previousRange, category)
            ])
            : [[], []];
        reportInfo = {
            ...reportInfo,
            groupId: allGroups ? "all" : requestedGroupId,
            groupIds
        };
    }

    const analysis = analyzeReport(expenses, previousExpenses, range, previousRange, query.type, category);
    return { 
        reportInfo,
        ...analysis };
}

module.exports = { generateReport };