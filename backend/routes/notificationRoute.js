const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const {
    listNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification
} = require("../controllers/notificationController");

const router = express.Router();

router.get("/", authMiddleware, listNotifications);
router.post("/read-all", authMiddleware, markAllNotificationsRead);
router.post("/:notificationId/read", authMiddleware, markNotificationRead);
router.delete("/:notificationId", authMiddleware, deleteNotification);

module.exports = router;
