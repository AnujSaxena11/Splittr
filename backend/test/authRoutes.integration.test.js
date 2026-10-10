process.env.DB_NAME = "splitter_test";
process.env.DB_USER = "splitter_test";
process.env.DB_PASSWORD = "splitter_test";
process.env.DB_HOST = "127.0.0.1";
process.env.ACCESS_TOKEN_SECRET = "test-only-access-secret";
process.env.NODE_ENV = "test";
delete process.env.EMAIL_USER;
delete process.env.EMAIL_PASS;

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const { sequelize, User, Session } = require("../config/dbconfig");
const authRoute = require("../routes/authRoute");

test("authentication routes handle signup, login, refresh, logout, profile, and reset errors", async (t) => {
    const originals = {
        findOne: User.findOne,
        findByPk: User.findByPk,
        createUser: User.create,
        createSession: Session.create,
        findSession: Session.findOne,
        findSessionById: Session.findByPk,
        transaction: sequelize.transaction,
        destroySessions: Session.destroy
    };
    const sessions = [];
    let currentUser = null;
    let nextSessionId = 1;
    User.findOne = async ({ where }) => currentUser?.email === where.email ? currentUser : null;
    User.findByPk = async (id) => currentUser?.id === Number(id) ? currentUser : null;
    User.create = async (values) => {
        currentUser = {
            id: 7,
            createdAt: new Date("2026-01-01T00:00:00Z"),
            updatedAt: new Date("2026-01-01T00:00:00Z"),
            save: async () => {},
            update: async (values) => Object.assign(currentUser, values),
            ...values
        };
        return currentUser;
    };
    Session.create = async (values) => {
        const session = {
            id: nextSessionId++,
            ...values,
            save: async () => {}
        };
        sessions.push(session);
        return session;
    };
    Session.findOne = async ({ where }) => sessions.find((session) => session.token_hash === where.token_hash) || null;
    Session.findByPk = async (id) => sessions.find((session) => session.id === Number(id)) || null;
    sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } });
    Session.destroy = async ({ where }) => {
        const before = sessions.length;
        for (let index = sessions.length - 1; index >= 0; index -= 1) {
            if (Object.entries(where).every(([key, value]) => sessions[index][key] === value)) {
                sessions.splice(index, 1);
            }
        }
        return before - sessions.length;
    };
    t.after(() => {
        User.findOne = originals.findOne;
        User.findByPk = originals.findByPk;
        User.create = originals.createUser;
        Session.create = originals.createSession;
        Session.findOne = originals.findSession;
        Session.findByPk = originals.findSessionById;
        sequelize.transaction = originals.transaction;
        Session.destroy = originals.destroySessions;
    });

    const app = express();
    app.use(express.json());
    app.use(require("cookie-parser")());
    app.use("/auth", authRoute);
    const server = app.listen(0);
    t.after(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const send = (path, options = {}) => fetch(`${baseUrl}${path}`, options);
    assert.equal((await send("/auth/me")).status, 401);
    const expiredAccessToken = jwt.sign({ userId: 7 }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: -1 });
    assert.equal((await send("/auth/me", {
        headers: { Authorization: `Bearer ${expiredAccessToken}` }
    })).status, 401);
    const signup = await send("/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Test User",
            email: "test@example.com",
            password: "VerySecurePass_123",
            cpassword: "VerySecurePass_123"
        })
    });
    assert.equal(signup.status, 201);
    const signupPayload = await signup.json();
    assert.equal(signupPayload.user.email, "test@example.com");
    assert.equal("password" in signupPayload.user, false);
    const signupCookies = signup.headers.getSetCookie();
    assert.equal(signupCookies.length, 2);
    assert.ok(signupCookies.every((cookie) => /HttpOnly/i.test(cookie)));

    const duplicateSignup = await send("/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: "Test User",
            email: "test@example.com",
            password: "VerySecurePass_123",
            cpassword: "VerySecurePass_123"
        })
    });
    assert.equal(duplicateSignup.status, 409);

    const login = await send("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", password: "VerySecurePass_123" })
    });
    assert.equal(login.status, 200);
    const loginCookies = login.headers.getSetCookie();
    const accessToken = loginCookies.find((cookie) => cookie.startsWith("accessToken=")).split(";")[0].split("=")[1];
    const refreshToken = loginCookies.find((cookie) => cookie.startsWith("refreshToken=")).split(";")[0].split("=")[1];
    const headers = { Authorization: `Bearer ${accessToken}` };

    assert.equal((await send("/auth/me", { headers })).status, 200);
    const profile = await (await send("/auth/user/7", { headers })).json();
    assert.equal(profile.user.name, "Test User");

    const refresh = await send("/auth/refresh", {
        method: "POST",
        headers: { Cookie: `refreshToken=${refreshToken}` }
    });
    assert.equal(refresh.status, 200);
    const refreshedToken = refresh.headers.getSetCookie().find((cookie) => cookie.startsWith("refreshToken=")).split(";")[0].split("=")[1];
    assert.notEqual(refreshedToken, refreshToken);

    const replayedRefresh = await send("/auth/refresh", {
        method: "POST",
        headers: { Cookie: `refreshToken=${refreshToken}` }
    });
    assert.equal(replayedRefresh.status, 401);

    const expiredToken = "expired-test-refresh-token";
    sessions.push({
        id: nextSessionId++,
        userId: currentUser.id,
        token_hash: crypto.createHash("sha256").update(expiredToken).digest("hex"),
        expires_at: new Date(Date.now() - 1)
    });
    const expiredRefresh = await send("/auth/refresh", {
        method: "POST",
        headers: { Cookie: `refreshToken=${expiredToken}` }
    });
    assert.equal(expiredRefresh.status, 401);
    assert.equal((await expiredRefresh.json()).message, "Invalid or expired refresh token");

    const logout = await send("/auth/logout", {
        method: "POST",
        headers
    });
    assert.equal(logout.status, 200);
    assert.equal((await send("/auth/me", { headers })).status, 401);

    const logoutAll = await send("/auth/logoutAll", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${signupCookies.find((cookie) => cookie.startsWith("accessToken=")).split(";")[0].split("=")[1]}`
        }
    });
    assert.equal(logoutAll.status, 200);
    assert.equal(sessions.length, 0);
    assert.equal((await send("/auth/me", {
        headers: {
            Authorization: `Bearer ${signupCookies.find((cookie) => cookie.startsWith("accessToken=")).split(";")[0].split("=")[1]}`
        }
    })).status, 401);

    const missingEmailService = await send("/auth/forgetPassword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" })
    });
    assert.equal(missingEmailService.status, 503);
    assert.equal(currentUser.otp, null);

    const invalidReset = await send("/auth/verifyOTP", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: "test@example.com",
            otp: "000000",
            newPassword: "FreshSecurePass_9",
            cnewPassword: "FreshSecurePass_9"
        })
    });
    assert.equal(invalidReset.status, 400);
    assert.equal((await invalidReset.json()).message, "Invalid or expired OTP");
});
