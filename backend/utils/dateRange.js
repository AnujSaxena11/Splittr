const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(value, message = "Invalid date") {
    if (typeof value !== "string" || !DATE_PATTERN.test(value))
        throw new Error(message);

    const [year, month, day] = value.split("-").map(Number);

    const date = new Date(Date.UTC(year, month - 1, day));

    if (date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day)
        throw new Error(message);

    return date;
}

function formatDate(date) {
    return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

function resolveDateRange(query) {
    const type = query.type;

    if (!["monthly", "weekly", "custom", "category"].includes(type))
        throw new Error("Invalid report type");

    if (type === "monthly") {
        const year = Number(query.year);
        const month = Number(query.month);

        if (!Number.isInteger(year) || year < 1)
            throw new Error("Invalid year");

        if (!Number.isInteger(month) || month < 1 || month > 12)
            throw new Error("Month must be between 1 and 12");

        return {
            startDate: `${year}-${String(month).padStart(2, "0")}-01`,
            endDate: formatDate(new Date(Date.UTC(year, month, 0)))
        };
    }
    if (type === "weekly") {
        const date = parseDateOnly(query.startDate);
        const start = addDays(date, -((date.getUTCDay() + 6) % 7));

        return {
            startDate: formatDate(start),
            endDate: formatDate(addDays(start, 6))
        };
    }
    if (type === "custom" || (type === "category" && (query.startDate || query.endDate))) {
        if (!query.startDate || !query.endDate)
            throw new Error("startDate and endDate are required");

        const start = parseDateOnly(query.startDate);
        const end = parseDateOnly(query.endDate);

        if (start > end) 
            throw new Error("startDate cannot be after endDate");

        return { 
            startDate: formatDate(start), 
            endDate: formatDate(end) 
        };
    }
    const now = new Date();

    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    return { 
        startDate: formatDate(start), 
        endDate: formatDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))) 
    };
}

function getPreviousDateRange(type, range) {
    const start = parseDateOnly(range.startDate);
    const end = parseDateOnly(range.endDate);

    if (type === "monthly") {
        const previousStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));

        return { 
            startDate: formatDate(previousStart), 
            endDate: formatDate(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0))) 
        };
    }
    const duration = Math.round((end - start) / 86400000) + 1;
    const previousEnd = addDays(start, -1);

    return { 
        startDate: formatDate(addDays(previousEnd, -duration + 1)), 
        endDate: formatDate(previousEnd) 
    };
}

module.exports = { resolveDateRange, getPreviousDateRange, parseDateOnly, formatDate };