process.env.ACCESS_TOKEN_SECRET = "notification-route-test-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Notification, Session, User } = require("../config/dbconfig");
const notificationRoute = require("../routes/notificationRoute");

test("notification APIs return and update only the authenticated user's notifications", async (t) => {
    const originals = {
        findSession: Session.findByPk,
        findUser: User.findByPk,
        findNotifications: Notification.findAll,
        findNotification: Notification.findOne,
        updateNotifications: Notification.update
    };
    const rows = [
        {
            id: "notification-1",
            userId: 7,
            groupId: 42,
            groupName: "Weekend plans",
            actorUserId: 8,
            kind: "expense",
            message: "Dinner was added",
            targetTab: "all-expenses",
            createdAt: new Date("2026-10-10T12:00:00.000Z"),
            readAt: null,
            async update(values) { Object.assign(this, values); },
            async destroy() { rows.splice(rows.indexOf(this), 1); }
        },
        {
            id: "notification-2",
            userId: 8,
            groupId: 42,
            groupName: "Weekend plans",
            actorUserId: 7,
            kind: "expense",
            message: "Private to another user",
            targetTab: "all-expenses",
            createdAt: new Date(),
            readAt: null
        }
    ];
    Session.findByPk = async (id) => ({
        id: Number(id),
        userId: 7,
        expires_at: new Date(Date.now() + 60_000)
    });
    User.findByPk = async (id) => Number(id) === 7 ? { id: 7, name: "Jenny" } : null;
    Notification.findAll = async ({ where, order, limit }) => {
        assert.deepEqual(where, { userId: 7 });
        assert.deepEqual(order, [["createdAt", "DESC"]]);
        assert.equal(limit, 50);
        return rows.filter((row) => row.userId === where.userId);
    };
    Notification.findOne = async ({ where }) => rows.find((row) => row.id === where.id && row.userId === where.userId) || null;
    Notification.update = async (values, { where }) => {
        rows.filter((row) => row.userId === where.userId && !row.readAt)
            .forEach((row) => Object.assign(row, values));
        return [rows.filter((row) => row.userId === where.userId).length];
    };

    t.after(() => {
        Session.findByPk = originals.findSession;
        User.findByPk = originals.findUser;
        Notification.findAll = originals.findNotifications;
        Notification.findOne = originals.findNotification;
        Notification.update = originals.updateNotifications;
    });

    const app = express();
    app.use(express.json());
    app.use("/notifications", notificationRoute);
    const server = app.listen(0);
    t.after(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}/notifications`;
    const token = jwt.sign({ userId: 7, session_id: 1 }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "5m" });
    const headers = { Authorization: `Bearer ${token}` };

    const listed = await fetch(url, { headers });
    assert.equal(listed.status, 200);
    const payload = await listed.json();
    assert.equal(payload.notifications.length, 1);
    assert.equal(payload.notifications[0].message, "Dinner was added");
    assert.equal(payload.notifications[0].groupName, "Weekend plans");
    assert.equal(payload.notifications[0].read, false);

    const marked = await fetch(`${url}/notification-1/read`, { method: "POST", headers });
    assert.equal(marked.status, 200);
    assert.equal((await marked.json()).notification.read, true);

    const privateNotification = await fetch(`${url}/notification-2/read`, { method: "POST", headers });
    assert.equal(privateNotification.status, 404);

    const markedAll = await fetch(`${url}/read-all`, { method: "POST", headers });
    assert.equal(markedAll.status, 200);
    assert.ok(rows.find((row) => row.id === "notification-1").readAt);
    assert.equal(rows.find((row) => row.id === "notification-2").readAt, null);

    const privateDelete = await fetch(`${url}/notification-2`, { method: "DELETE", headers });
    assert.equal(privateDelete.status, 404);

    const removed = await fetch(`${url}/notification-1`, { method: "DELETE", headers });
    assert.equal(removed.status, 204);
    const afterDelete = await fetch(url, { headers });
    assert.deepEqual((await afterDelete.json()).notifications, []);
});
