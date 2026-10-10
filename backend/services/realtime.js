const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const { Group, GroupMember, Notification, Session, User } = require("../config/dbconfig");

let io;

function getCookieValue(cookieHeader, name) {
    const cookie = cookieHeader?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
    return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

function attachRealtime(server) {
    const configuredOrigins = (process.env.CORS_ORIGINS || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
    const allowedOrigins = new Set(process.env.NODE_ENV === "production"
        ? configuredOrigins
        : ["http://localhost:5173", "http://localhost:5174", ...configuredOrigins]);

    io = new Server(server, {
        path: "/socket.io",
        allowRequest(request, callback) {
            const origin = request.headers.origin;
            if (!origin || allowedOrigins.has(origin)) return callback(null, true);
            return callback("Origin is not allowed", false);
        },
        cors: {
            credentials: true,
            origin(origin, callback) {
                if (!origin || allowedOrigins.has(origin)) return callback(null, true);
                return callback(new Error("Origin is not allowed"));
            }
        }
    });

    io.use(async (socket, next) => {
        try {
            const token = getCookieValue(socket.handshake.headers.cookie, "accessToken") ||
                getCookieValue(socket.handshake.headers.cookie, "token") ||
                socket.handshake.auth?.accessToken;
            if (!token) return next(new Error("Unauthorized"));

            const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
            const userId = Number(decoded.userId || decoded.user_id);
            if (!Number.isSafeInteger(userId) || !decoded.session_id) return next(new Error("Unauthorized"));

            const session = await Session.findByPk(decoded.session_id);
            if (!session || Number(session.userId) !== userId || session.revoked_at ||
                new Date(session.expires_at) <= new Date()) {
                return next(new Error("Session is no longer active"));
            }
            const user = await User.findByPk(userId);
            if (!user) return next(new Error("Unauthorized"));

            const memberships = await GroupMember.findAll({
                where: { userId, status: "accepted" },
                attributes: ["groupId"]
            });
            socket.data.userId = userId;
            socket.data.sessionId = session.id;
            socket.data.groupIds = memberships.map((membership) => Number(membership.groupId));
            return next();
        } catch (error) {
            if (["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(error.name)) {
                return next(new Error("Unauthorized"));
            }
            return next(error);
        }
    });

    io.on("connection", (socket) => {
        socket.join(`user:${socket.data.userId}`);
        socket.join(`session:${socket.data.sessionId}`);
        for (const groupId of socket.data.groupIds) socket.join(`group:${groupId}`);
    });

    return io;
}

async function emitGroupUpdate(groupId, { deleted = false, actorUserId, notification } = {}) {
    const id = Number(groupId);
    const activeIo = io;
    const payload = { groupId: id, deleted, actorUserId: actorUserId ? Number(actorUserId) : null };
    activeIo?.to(`group:${id}`).emit("group:updated", payload);
    if (notification && activeIo) {
        try {
            const [members, group] = await Promise.all([
                GroupMember.findAll({
                    where: { groupId: id, status: "accepted" },
                    attributes: ["userId"]
                }),
                Group.findByPk(id, { attributes: ["name"] })
            ]);
            const recipients = [...new Set(members
                .map((member) => Number(member.userId))
                .filter((userId) => userId !== Number(actorUserId)))];
            if (!recipients.length) return;
            const createdAt = new Date();
            const records = await Notification.bulkCreate(recipients.map((userId) => ({
                userId,
                groupId: id,
                groupName: group?.name || null,
                actorUserId: actorUserId ? Number(actorUserId) : null,
                ...notification,
                createdAt
            })));
            if (io !== activeIo || !activeIo) return;
            for (const record of records) {
                const data = record.get ? record.get({ plain: true }) : record;
                activeIo.to(`user:${data.userId}`).emit("group:notification", {
                    id: data.id,
                    groupId: data.groupId,
                    groupName: data.groupName,
                    actorUserId: data.actorUserId,
                    kind: data.kind,
                    message: data.message,
                    targetTab: data.targetTab,
                    createdAt: data.createdAt,
                    read: false
                });
            }
        } catch (error) {
            console.error(`Unable to persist group notification for group ${id}:`, error);
        }
    }
}

function emitUserUpdate(userId, groupId) {
    if (!io) return;
    io.to(`user:${Number(userId)}`).emit("user:updated", groupId ? { groupId: Number(groupId) } : {});
}

async function emitUserNotification(userId, notification) {
    if (!io) return;
    try {
        const record = await Notification.create({ userId: Number(userId), ...notification });
        const data = record.get ? record.get({ plain: true }) : record;
        if (!io) return;
        io.to(`user:${Number(userId)}`).emit("user:notification", {
            id: data.id,
            groupId: data.groupId,
            groupName: data.groupName,
            actorUserId: data.actorUserId,
            kind: data.kind,
            message: data.message,
            targetTab: data.targetTab,
            createdAt: data.createdAt,
            read: false
        });
    } catch (error) {
        console.error(`Unable to persist user notification for user ${userId}:`, error);
    }
}

function removeUserFromGroup(userId, groupId) {
    if (!io) return;
    io.in(`user:${Number(userId)}`).socketsLeave(`group:${Number(groupId)}`);
}

function addUserToGroup(userId, groupId) {
    if (!io) return;
    io.in(`user:${Number(userId)}`).socketsJoin(`group:${Number(groupId)}`);
}

function disconnectSession(sessionId) {
    if (!io) return;
    io.in(`session:${Number(sessionId)}`).disconnectSockets(true);
}

function disconnectUser(userId) {
    if (!io) return;
    io.in(`user:${Number(userId)}`).disconnectSockets(true);
}

function closeRealtime() {
    if (!io) return Promise.resolve();
    const activeServer = io;
    io = undefined;
    return new Promise((resolve) => activeServer.close(resolve));
}

module.exports = {
    attachRealtime,
    emitGroupUpdate,
    emitUserUpdate,
    emitUserNotification,
    removeUserFromGroup,
    addUserToGroup,
    disconnectSession,
    disconnectUser,
    closeRealtime
};
