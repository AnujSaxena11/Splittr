const { ExpenseData } = require("../config/dbconfig");
const { emitUserUpdate } = require("../services/realtime");

exports.addExpense = async (req, res) => {
    try{
        const {
            amount,
            category,
            desc,
            paid_to
        } = req.body;
        if (!amount || !category || !paid_to) {
            return res.status(400).json({
                error: "amount, category and paid_to are required"
            });
        }
        const scope = 'self';
        const paidBy = req.user.userId;
        await ExpenseData.create({
            amount,
            scope,
            category,
            desc,
            paid_to,
            paidBy
        });
        emitUserUpdate(paidBy);
        res.status(201).json({ message: "Expense added successfully" });
    }
    catch(e){
        console.error("unable to add expense: ", e);
        res.status(500).json({error: "Internal server error"});
    }
}

exports.getExpenseById = async (req, res) => {
    try{
        const expense = await ExpenseData.findOne({
            where: {
                id: req.params.id,
                paidBy: req.user.userId,
                scope: "self"
            }
        });
        if(!expense){
            return res.status(404).json({message: "Expense does not exist"});
        }
        res.status(200).json({ expense });
    }
    catch(e){
        console.error("unable to get expense: ", e);
        res.status(500).json({error: "Internal server error"});
    }
}

exports.getAllExpense = async (req, res) => {
    try{
        const userId = req.user.userId;
        const allExpenses = await ExpenseData.findAll({ where : { paidBy : userId, scope: "self" } });
        if(allExpenses.length === 0){
            return res.status(200).json({message: "No expense exist"});
        }
        res.status(200).json({allExpenses});
    }
    catch(e){
        console.error("unable to fetch all expenses: ", e);
        res.status(500).json({error: "Internal server error"});
    }
}