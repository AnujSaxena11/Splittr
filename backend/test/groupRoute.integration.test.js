process.env.DB_NAME = "splitter_test";
process.env.DB_USER = "splitter_test";
process.env.DB_PASSWORD = "splitter_test";
process.env.DB_HOST = "127.0.0.1";
process.env.ACCESS_TOKEN_SECRET = "test-only-access-secret";
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { sequelize, User, Group, GroupMember, Session } = require("../config/dbconfig");
const groupRoute = require("../routes/groupRoute");

test("group creation authenticates, validates, and returns the created group", async (t) => {
    const originals = {
        findUser: User.findByPk,
        findSession: Session.findByPk,
        transaction: sequelize.transaction,
        createGroup: Group.create,
        createMember: GroupMember.create
    };
    const user = { id: 7, name: "Test User", email: "test@example.com" };
    const group = { id: 42, name: "Weekend plans", ownerId: 7, unique_code: "AB12CD34" };
    User.findByPk = async () => user;
    Session.findByPk = async (id) => ({ id: Number(id), userId: user.id, expires_at: new Date(Date.now() + 60_000) });
    sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } });
    Group.create = async (values) => ({ ...group, ...values });
    GroupMember.create = async () => ({ id: 1 });
    t.after(() => {
        User.findByPk = originals.findUser;
        Session.findByPk = originals.findSession;
        sequelize.transaction = originals.transaction;
        Group.create = originals.createGroup;
        GroupMember.create = originals.createMember;
    });

    const app = express();
    app.use(express.json());
    app.use("/group", groupRoute);
    const server = app.listen(0);
    t.after(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const token = jwt.sign({ userId: user.id, session_id: 1 }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "5m" });

    const unauthorized = await fetch(`${baseUrl}/group/createGroup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Weekend plans" })
    });
    assert.equal(unauthorized.status, 401);
    assert.equal((await unauthorized.json()).message, "Unauthorized access");

    const invalid = await fetch(`${baseUrl}/group/createGroup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: "x" })
    });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).message, /Name must be atleast 2 characters long/);

    const created = await fetch(`${baseUrl}/group/createGroup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: "Weekend plans", description: "A little trip together" })
    });
    assert.equal(created.status, 201);
    const payload = await created.json();
    assert.equal(payload.group.name, "Weekend plans");
    assert.equal(payload.group.ownerId, user.id);
});
