const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function round(value) {
    return Number((Number(value) || 0).toFixed(2));
}

function normalizeExpense(expense) {
    const value = expense.get ? expense.get({ plain: true }) : expense;
    return {
        id: value.id,
        amount: Number(value.amount) || 0,
        category: value.category || "Others",
        description: value.desc || value.description || "",
        date: String(value.date).slice(0, 10)
    };
}
function amountByCategory(expenses) {
    const groups = new Map();

    for (const expense of expenses) {
        const current = groups.get(expense.category) || { amount: 0, transactionCount: 0 };

        current.amount += expense.amount;
        current.transactionCount += 1;

        groups.set(expense.category, current);
    }
    return groups;
}
function dailyValues(expenses, startDate, endDate) {
    const totals = new Map();

    for (const expense of expenses) {
        totals.set(
            expense.date,
            (totals.get(expense.date) || 0) + expense.amount
        );
    }

    const result = [];

    let currDate = new Date(`${startDate}T00:00:00Z`);
    const rangeEndDate = new Date(`${endDate}T00:00:00Z`);

    for (; currDate <= rangeEndDate; currDate.setUTCDate(currDate.getUTCDate() + 1)) {
        const key = currDate.toISOString().slice(0, 10);
        result.push({
            date: key,
            amount: round(totals.get(key) || 0)
        });
    }
    return result;
}
function analyzeExpenses(rawExpenses, range) {
    const expenses = rawExpenses.map(normalizeExpense);

    const totalSpent = expenses.reduce((total, expense) => total + expense.amount, 0);

    const categoryGroups = amountByCategory(expenses);

    const categoryBreakdown = [
        ...categoryGroups.entries()
    ].map(([category, values]) => ({
        category,
        amount: round(values.amount),
        transactionCount: values.transactionCount,
        percentage: totalSpent ? round(values.amount / totalSpent * 100) : 0
    }))
        .sort((left, right) => right.amount - left.amount);

    const dailyTrend = dailyValues(expenses, range.startDate, range.endDate);

    const highestDay = dailyTrend.reduce((best, current) => current.amount > (best?.amount ?? -1) ? current : best, null);

    const weeklyTotals = DAY_NAMES.map(day => ({ day, amount: 0 }));

    for (const expense of expenses) {
        const date = new Date(`${expense.date}T00:00:00Z`);
        weeklyTotals[date.getUTCDay()].amount += expense.amount;
    }

    const weeklyPattern = [1, 2, 3, 4, 5, 6, 0].map(index => ({
        day: DAY_NAMES[index],
        amount: round(weeklyTotals[index].amount)
    }));

    const highestWeekday = weeklyPattern.reduce((best, current) => current.amount > (best?.amount ?? -1) ? current : best, null);

    const dayCount = dailyTrend.length || 1;

    return {
        summary: {
            totalSpent: round(totalSpent),
            transactionCount: expenses.length,
            averageTransaction: expenses.length ? round(totalSpent / expenses.length) : 0,
            dailyAverage: round(totalSpent / dayCount),
            highestExpense: expenses.length ? round(Math.max(...expenses.map(expense => expense.amount))) : 0,
            lowestExpense: expenses.length ? round(Math.min(...expenses.map(expense => expense.amount))) : 0,
            highestSpendingDay: highestDay && highestDay.amount > 0 ? highestDay.date : null
        },
        categoryBreakdown,
        dailyTrend,
        weeklyPattern,
        highestSpendingDayOfWeek: highestWeekday && highestWeekday.amount > 0 ? highestWeekday.day : null,
        topExpenses: expenses
            .sort((left, right) => right.amount - left.amount)
            .slice(0, 5)
            .map(expense => ({ ...expense, amount: round(expense.amount) }))
    };
}
function compareReports(current, previous) {
    const difference = round(current.summary.totalSpent - previous.summary.totalSpent);

    const percentageChange = previous.summary.totalSpent ? round(difference / previous.summary.totalSpent * 100) : null;

    const categories = new Map();
    for (const item of current.categoryBreakdown) {
        categories.set(
            item.category,
            {
                category: item.category,
                currentAmount: item.amount,
                previousAmount: 0
            }
        );
    }
    for (const item of previous.categoryBreakdown) {
        const value = categories.get(item.category) ||
        {
            category: item.category,
            currentAmount: 0,
            previousAmount: 0
        };

        value.previousAmount = item.amount;
        categories.set(item.category, value);
    }

    const categoryComparison = [
        ...categories.values()
    ]
        .map(item => ({
            ...item,
            difference: round(item.currentAmount - item.previousAmount),
            percentageChange: item.previousAmount ? round((item.currentAmount - item.previousAmount) / item.previousAmount * 100) : null
        }))
        .sort((left, right) => right.currentAmount - left.currentAmount);
    return {
        currentPeriod: current.summary.totalSpent,
        previousPeriod: previous.summary.totalSpent,
        difference,
        percentageChange,
        categoryComparison
    };
}
function createInsights(report) {
    const insights = [];

    const highestCategory = report.categoryBreakdown[0];

    if (highestCategory)
        insights.push(`${highestCategory.category} was your largest spending category.`);

    const percentChange = report.comparison.percentageChange;

    if (percentChange !== null) {
        const changeDirection = percentChange >= 0 ? "more" : "less";

        insights.push(`You spent ${Math.abs(percentChange)}% ${changeDirection} than the previous period.`);
    }

    const highestSpendingDay = report.summary.highestSpendingDay;

    if (highestSpendingDay) {
        insights.push(`${highestSpendingDay} was your highest-spending day.`);
    }

    const highestExpense = report.summary.highestExpense;

    if (highestExpense) {
        insights.push(`${highestExpense} was your largest expense.`);
    }

    return insights;
}
function buildCategoryReport(category, expenses, report, previousExpenses, range, previousRange) {

    const current = analyzeExpenses(
        expenses.filter(expense => normalizeExpense(expense).category === category),
        range
    );

    const previous = analyzeExpenses(
        previousExpenses.filter(expense => normalizeExpense(expense).category === category),
        previousRange
    );

    return {
        category,
        totalSpent: current.summary.totalSpent,
        transactionCount: current.summary.transactionCount,
        averageTransaction: current.summary.averageTransaction,
        percentageOfTotal: report.summary.totalSpent ? round(current.summary.totalSpent / report.summary.totalSpent * 100) : 0,
        dailyTrend: current.dailyTrend,
        topExpenses: current.topExpenses,
        comparison: compareReports(current, previous)
    };
}
function analyzeReport(expenses, previousExpenses, range, previousRange, type, category) {
    const report = analyzeExpenses(expenses, range);

    report.comparison = compareReports(
        report,
        analyzeExpenses(previousExpenses, previousRange)
    );

    report.categoryComparison = report.comparison.categoryComparison;

    report.insights = createInsights(report);

    if (type === "category") {
        report.categoryReport = buildCategoryReport(category, expenses, report, previousExpenses, range, previousRange);
    }
    return report;
}

module.exports = { analyzeReport, round };