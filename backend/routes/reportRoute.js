const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const { getExpenseReport } = require("../controllers/reportController");
const router = express.Router();

router.get("/expenses", authMiddleware, getExpenseReport);

module.exports = router;