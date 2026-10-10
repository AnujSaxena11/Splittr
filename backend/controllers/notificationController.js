const { Notification } = require("../config/dbconfig");

function serializeNotification(notification) {
    const data = notification.get ? notification.get({ plain: true }) : notification;
    return {
        id: data.id,
        groupId: data.groupId,
        groupName: data.groupName,
        actorUserId: data.actorUserId,
        kind: data.kind,
        message: data.message,
        targetTab: data.targetTab,
        createdAt: data.createdAt,
        read: Boolean(data.readAt)
    };
}

exports.listNotifications = async (req, res) => {
    try {
        const notifications = await Notification.findAll({
            where: { userId: req.user.userId },
            order: [["createdAt", "DESC"]],
            limit: 50
        });
        return res.status(200).json({ notifications: notifications.map(serializeNotification) });
    } catch (error) {
        console.error("Unable to load notifications:", error);
        return res.status(500).json({ message: "Unable to load notifications." });
    }
};

exports.markNotificationRead = async (req, res) => {
    try {
        const notification = await Notification.findOne({
            where: { id: req.params.notificationId, userId: req.user.userId }
        });
        if (!notification) return res.status(404).json({ message: "Notification not found." });
        if (!notification.readAt) await notification.update({ readAt: new Date() });
        return res.status(200).json({ notification: serializeNotification(notification) });
    } catch (error) {
        console.error("Unable to mark notification as read:", error);
        return res.status(500).json({ message: "Unable to update notification." });
    }
};

exports.deleteNotification = async (req, res) => {
    try {
        const notification = await Notification.findOne({
            where: { id: req.params.notificationId, userId: req.user.userId }
        });
        if (!notification) return res.status(404).json({ message: "Notification not found." });
        await notification.destroy();
        return res.status(204).end();
    } catch (error) {
        console.error("Unable to delete notification:", error);
        return res.status(500).json({ message: "Unable to delete notification." });
    }
};

exports.markAllNotificationsRead = async (req, res) => {
    try {
        await Notification.update(
            { readAt: new Date() },
            { where: { userId: req.user.userId, readAt: null } }
        );
        return res.status(200).json({ message: "Notifications marked as read." });
    } catch (error) {
        console.error("Unable to mark all notifications as read:", error);
        return res.status(500).json({ message: "Unable to update notifications." });
    }
};
