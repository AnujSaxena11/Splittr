const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const { addExpense, getExpenseById, getAllExpense } = require("../controllers/selfExpensesController");
const { addExpenseSchema } = require("../validations/selfValidator");
const validate = require("../middlewares/validate");
const router = express.Router();

router.post("/expense", authMiddleware, validate(addExpenseSchema), addExpense);
router.get("/expense/:id", authMiddleware, getExpenseById);
router.get("/expenses", authMiddleware, getAllExpense);

module.exports = router;