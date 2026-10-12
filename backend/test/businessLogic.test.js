const test = require("node:test");
const assert = require("node:assert/strict");
const { simplifyDebts } = require("../services/expenseService");
const { analyzeReport } = require("../services/reportAnalysis.service");

test("debt simplification balances multiple creditors and debtors", () => {
    const transactions = simplifyDebts([
        { userId: 1, totalPaid: 120, totalOwed: 20 },
        { userId: 2, totalPaid: 10, totalOwed: 70 },
        { userId: 3, totalPaid: 0, totalOwed: 40 }
    ]);
    assert.deepEqual(transactions, [
        { from: 2, to: 1, amount: 60 },
        { from: 3, to: 1, amount: 40 }
    ]);
});

test("debt simplification returns no transfers for settled or empty balances", () => {
    assert.deepEqual(simplifyDebts([]), []);
    assert.deepEqual(simplifyDebts([
        { userId: 1, totalPaid: 20, totalOwed: 20 },
        { userId: 2, totalPaid: 15, totalOwed: 15 }
    ]), []);
});

test("report analysis aggregates totals, categories, daily values, and comparisons", () => {
    const range = { startDate: "2026-10-01", endDate: "2026-10-02" };
    const previousRange = { startDate: "2026-09-29", endDate: "2026-09-30" };
    const current = [
        { id: 1, amount: "10.50", category: "Food", desc: "Lunch", date: "2026-10-01" },
        { id: 2, amount: "9.50", category: "Food", desc: "Coffee", date: "2026-10-01" },
        { id: 3, amount: "20.00", category: "Bills", desc: "Internet", date: "2026-10-02" }
    ];
    const previous = [
        { id: 4, amount: "10.00", category: "Food", desc: "Lunch", date: "2026-09-29" }
    ];

    const report = analyzeReport(current, previous, range, previousRange, "custom", null);

    assert.equal(report.summary.totalSpent, 40);
    assert.equal(report.summary.transactionCount, 3);
    assert.equal(report.summary.averageTransaction, 13.33);
    assert.deepEqual(report.dailyTrend, [
        { date: "2026-10-01", amount: 20 },
        { date: "2026-10-02", amount: 20 }
    ]);
    assert.equal(report.categoryBreakdown[0].category, "Food");
    assert.equal(report.categoryBreakdown[0].percentage, 50);
    assert.equal(report.comparison.previousPeriod, 10);
    assert.equal(report.comparison.difference, 30);
    assert.equal(report.comparison.percentageChange, 300);
    assert.equal(report.topExpenses[0].description, "Internet");
    assert.equal(report.topExpenses[0].name, "");
    assert.ok(report.insights.some((insight) => insight.includes("largest spending category")));
});

test("report top expenses include the personal expense name", () => {
    const range = { startDate: "2026-10-01", endDate: "2026-10-01" };
    const expenses = [{
        id: 1,
        amount: "12.50",
        category: "Food",
        paid_to: "Corner Market",
        desc: "Lunch",
        date: "2026-10-01"
    }];

    const report = analyzeReport(expenses, [], range, range, "custom", null);

    assert.equal(report.topExpenses[0].name, "Corner Market");
    assert.equal(report.topExpenses[0].description, "Lunch");
});

test("category report filters the chosen category against total expenses", () => {
    const range = { startDate: "2026-10-01", endDate: "2026-10-01" };
    const expenses = [
        { id: 1, amount: 30, category: "Food", date: "2026-10-01" },
        { id: 2, amount: 70, category: "Bills", date: "2026-10-01" }
    ];
    const report = analyzeReport(expenses, [], range, range, "category", "Food");

    assert.equal(report.summary.totalSpent, 100);
    assert.equal(report.categoryReport.totalSpent, 30);
    assert.equal(report.categoryReport.percentageOfTotal, 30);
});
