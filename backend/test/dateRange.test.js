const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveDateRange, getPreviousDateRange, parseDateOnly } = require("../utils/dateRange");

test("monthly reports resolve leap-year boundaries and the prior month", () => {
    const current = resolveDateRange({ type: "monthly", year: "2024", month: "2" });
    assert.deepEqual(current, { startDate: "2024-02-01", endDate: "2024-02-29" });
    assert.deepEqual(getPreviousDateRange("monthly", current), {
        startDate: "2024-01-01",
        endDate: "2024-01-31"
    });
});

test("weekly ranges begin on Monday and span seven days", () => {
    assert.deepEqual(resolveDateRange({ type: "weekly", startDate: "2026-10-11" }), {
        startDate: "2026-10-05",
        endDate: "2026-10-11"
    });
});

test("custom date ranges reject missing, malformed, impossible, and reversed dates", () => {
    assert.throws(() => resolveDateRange({ type: "custom", startDate: "2026-01-01" }), {
        message: "startDate and endDate are required"
    });
    assert.throws(() => resolveDateRange({ type: "custom", startDate: "2026-02-30", endDate: "2026-03-01" }), {
        message: "Invalid date"
    });
    assert.throws(() => resolveDateRange({ type: "custom", startDate: "2026-03-02", endDate: "2026-03-01" }), {
        message: "startDate cannot be after endDate"
    });
    assert.throws(() => parseDateOnly("03/01/2026"), { message: "Invalid date" });
});

test("report range inputs reject unknown types and invalid month/year bounds", () => {
    assert.throws(() => resolveDateRange({ type: "yearly" }), { message: "Invalid report type" });
    assert.throws(() => resolveDateRange({ type: "monthly", year: "0", month: "1" }), { message: "Invalid year" });
    assert.throws(() => resolveDateRange({ type: "monthly", year: "2026", month: "13" }), {
        message: "Month must be between 1 and 12"
    });
});

test("category reports default to the current month when no custom dates are passed", () => {
    const result = resolveDateRange({ type: "category" });
    assert.match(result.startDate, /^\d{4}-\d{2}-01$/);
    assert.match(result.endDate, /^\d{4}-\d{2}-\d{2}$/);
});
