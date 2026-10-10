process.env.ACCESS_TOKEN_SECRET = "realtime-test-access-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const { io: createClient } = require("socket.io-client");
const { Group, GroupMember, Notification, Session, User } = require("../config/dbconfig");
const { attachRealtime, closeRealtime, emitGroupUpdate, disconnectSession } = require("../services/realtime");

test("realtime authenticates sockets and sends group updates only to accepted members", async (t) => {
    const originals = {
        findSession: Session.findByPk,
        findUser: User.findByPk,
        findMemberships: GroupMember.findAll,
        findGroup: Group.findByPk,
        bulkCreateNotifications: Notification.bulkCreate
    };
    const savedNotifications = [];
    Session.findByPk = async (id) => ({
        id: Number(id),
        userId: Number(id) === 1 ? 7 : 8,
        expires_at: new Date(Date.now() + 60_000)
    });
    User.findByPk = async (id) => [7, 8].includes(Number(id)) ? { id: Number(id) } : null;
    GroupMember.findAll = async ({ where }) => {
        if (where.userId !== undefined) return Number(where.userId) === 7 ? [{ groupId: 42 }] : [];
        if (Number(where.groupId) === 42 && where.status === "accepted") return [{ userId: 7 }, { userId: 9 }];
        return [];
    };
    Group.findByPk = async () => ({ name: "Weekend plans" });
    Notification.bulkCreate = async (notifications) => {
        const records = notifications.map((notification, index) => ({
            id: `notification-${index + 1}`,
            ...notification
        }));
        savedNotifications.push(...records);
        return records;
    };

    const server = http.createServer();
    attachRealtime(server);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const clients = [];

    t.after(async () => {
        clients.forEach((client) => client.disconnect());
        await closeRealtime();
        Session.findByPk = originals.findSession;
        User.findByPk = originals.findUser;
        GroupMember.findAll = originals.findMemberships;
        Group.findByPk = originals.findGroup;
        Notification.bulkCreate = originals.bulkCreateNotifications;
    });

    const unauthenticated = createClient(url, {
        path: "/socket.io",
        transports: ["websocket"],
        reconnection: false
    });
    clients.push(unauthenticated);
    const rejected = new Promise((resolve) => unauthenticated.once("connect_error", resolve));
    await rejected;

    const token = jwt.sign({ userId: 7, session_id: 1 }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "5m" });
    const member = createClient(url, {
        path: "/socket.io",
        transports: ["websocket"],
        extraHeaders: { Cookie: `accessToken=${token}` },
        reconnection: false
    });
    clients.push(member);
    await new Promise((resolve, reject) => {
        member.once("connect", resolve);
        member.once("connect_error", reject);
    });

    const outsiderToken = jwt.sign({ userId: 8, session_id: 2 }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "5m" });
    const outsider = createClient(url, {
        path: "/socket.io",
        transports: ["websocket"],
        extraHeaders: { Cookie: `accessToken=${outsiderToken}` },
        reconnection: false
    });
    clients.push(outsider);
    await new Promise((resolve, reject) => {
        outsider.once("connect", resolve);
        outsider.once("connect_error", reject);
    });

    const updated = new Promise((resolve) => member.once("group:updated", resolve));
    const notification = new Promise((resolve) => member.once("group:notification", resolve));
    let outsiderReceivedUpdate = false;
    let outsiderReceivedNotification = false;
    outsider.once("group:updated", () => { outsiderReceivedUpdate = true; });
    outsider.once("group:notification", () => { outsiderReceivedNotification = true; });
    await emitGroupUpdate(42, {
        actorUserId: 9,
        notification: { kind: "expense", message: "Dinner was added", targetTab: "all-expenses" }
    });
    assert.deepEqual(await updated, { groupId: 42, deleted: false, actorUserId: 9 });
    const receivedNotification = await notification;
    assert.equal(receivedNotification.groupId, 42);
    assert.equal(receivedNotification.actorUserId, 9);
    assert.equal(receivedNotification.kind, "expense");
    assert.equal(receivedNotification.message, "Dinner was added");
    assert.equal(receivedNotification.targetTab, "all-expenses");
    assert.equal(receivedNotification.id, "notification-1");
    assert.equal(receivedNotification.groupName, "Weekend plans");
    assert.ok(receivedNotification.createdAt);
    assert.deepEqual(savedNotifications.map(({ userId }) => userId), [7]);
    assert.equal(savedNotifications[0].message, "Dinner was added");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(outsiderReceivedUpdate, false);
    assert.equal(outsiderReceivedNotification, false);

    const disconnected = new Promise((resolve) => member.once("disconnect", resolve));
    disconnectSession(1);
    await disconnected;
});
