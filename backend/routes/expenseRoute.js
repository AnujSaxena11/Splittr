const express = require("express");
const {
    addExpense,
    getTripExpenses,
    getGroupSettlements,
    getGroupBalances,
    requestGroupSettlement,
    respondToGroupSettlement
} = require("../controllers/expenseSplitter");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const { addExpenseSchema, settleExpenseSchema, settlementResponseSchema } = require("../validations/expenseValidator");

router.post("/add-expense/:groupId", authMiddleware, validate(addExpenseSchema), addExpense);
router.get('/get-expenses/:groupId', authMiddleware, getTripExpenses);
router.get('/get-settlements/:groupId', authMiddleware, getGroupSettlements);
router.get('/get-balances/:groupId', authMiddleware, getGroupBalances);
router.post('/settle/:groupId', authMiddleware, validate(settleExpenseSchema), requestGroupSettlement);
router.post('/settlements/:settlementId/respond', authMiddleware, validate(settlementResponseSchema), respondToGroupSettlement);

module.exports = router;