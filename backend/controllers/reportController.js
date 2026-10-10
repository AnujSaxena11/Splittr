const { generateReport } = require("../services/report.service");

function reportError(res, error) {
    const known = [
        "Invalid report type", 
        "Invalid date", 
        "startDate and endDate are required", 
        "startDate cannot be after endDate", 
        "Month must be between 1 and 12",
        "Invalid year", "Category is required", 
        "Unknown category", "Invalid report scope",
        "A valid group or all groups must be selected"
    ];
    const status = error.status || (known.includes(error.message) ? 400 : 500);
    const message = status === 400 || status === 403 ? error.message : "Internal server error";
    return res.status(status).json({ message });
}

exports.getExpenseReport = async (req, res) => {
    try { 
        return res
            .status(200)
            .json(await generateReport(req.user.userId, req.query)); 
    }
    catch (error) { 
        console.error("Unable to generate expense report:", error); 
        return reportError(res, error); 
    }
};
