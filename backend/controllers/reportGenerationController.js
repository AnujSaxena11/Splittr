const ExcelJS = require("exceljs");
const path = require("path");
const { ExpenseData } = require("../config/dbconfig");

exports.dailyReportGen = async (req, res) => {
    try{
        const workbook = new ExcelJS.workbook();
        const worksheet = workbook.addWorksheet("Daily Report");
        worksheet.columns = [
            { header: "ID", key: "id", width: 10 },
            { header: "Amount", key: "amount", width: 15 },
            { header: "Paid To", key: "paid_to", width: 20 },
            { header: "Category", key: "category", width: 20 },
            { header: "Description", key: "desc", width: 30 },
            { header: "Date", key: "createdAt", width: 20 }
        ];

        const userId = req.user.id;
        const today = new Date().toISOString().split("T")[0];

        const allExpenses = await ExpenseData.findAll({ where : { paid_by : userId, scope: "self", date: today } });

        if(allExpenses.length === 0){
            return res.status(200).json({message: "No expense exist"});
        }
        allExpenses.forEach(expense => {
            worksheet.addRow({
                id: expense.id,
                amount: expense.amount,
                paid_to: expense.paid_to,
                category: expense.category,
                desc: expense.desc,
                createdAt: expense.createdAt
            });
        });

        worksheet.getRow(1).eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFF' } };
            cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '4F81BD' }
            };
        });

        const filePath = path.join(__dirname, "../reports/daily_report.xlsx");
        await workbook.xlsx.writeFile(filePath);
        res.status(200).json({message: "Daily report generated successfully", filePath});
    }
    catch(e){
        console.error("unable to generate daily report: ", e);
        res.status(500).json({error: "Internal server error"});
    }
}
