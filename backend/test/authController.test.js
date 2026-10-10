process.env.DB_NAME = "splitter_test";
process.env.DB_USER = "splitter_test";
process.env.DB_PASSWORD = "splitter_test";
process.env.DB_HOST = "127.0.0.1";
process.env.ACCESS_TOKEN_SECRET = "test-only-access-secret";
process.env.NODE_ENV = "test";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const { sequelize, User, Session } = require("../config/dbconfig");
const authController = require("../controllers/authController");

function responseRecorder() {
    return {
        statusCode: 200,
        payload: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        }
    };
}

test("valid one-time codes reset a password and revoke existing sessions", async (t) => {
    const oldFindOne = User.findOne;
    const oldDestroy = Session.destroy;
    const oldTransaction = sequelize.transaction;
    const otp = "123456";
    const user = {
        id: 18,
        password: await bcrypt.hash("OldPass_1", 4),
        otp: crypto.createHmac("sha256", process.env.ACCESS_TOKEN_SECRET).update(otp).digest("hex"),
        otp_expires: new Date(Date.now() + 60_000),
        save: async () => {}
    };
    let destroyedSessions = null;

    User.findOne = async () => user;
    sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } });
    Session.destroy = async (options) => {
        destroyedSessions = options;
    };
    t.after(() => {
        User.findOne = oldFindOne;
        Session.destroy = oldDestroy;
        sequelize.transaction = oldTransaction;
    });

    const response = responseRecorder();
    await authController.verifyOTP({
        body: {
            email: "person@example.com",
            otp,
            newPassword: "NewSecurePass_2",
            cnewPassword: "NewSecurePass_2"
        }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.message, "Password reset successful");
    assert.equal(user.otp, null);
    assert.equal(user.otp_expires, null);
    assert.notEqual(user.password, "NewSecurePass_2");
    assert.equal(await bcrypt.compare("NewSecurePass_2", user.password), true);
    assert.deepEqual(destroyedSessions.where, { userId: 18 });
});

test("invalid and expired one-time codes cannot change the password", async (t) => {
    const oldFindOne = User.findOne;
    const oldDestroy = Session.destroy;
    const oldTransaction = sequelize.transaction;
    const user = {
        id: 19,
        password: await bcrypt.hash("OldPass_1", 4),
        otp: crypto.createHmac("sha256", process.env.ACCESS_TOKEN_SECRET).update("654321").digest("hex"),
        otp_expires: new Date(Date.now() - 1),
        save: async () => {}
    };
    let destroyed = false;
    User.findOne = async () => user;
    sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } });
    Session.destroy = async () => { destroyed = true; };
    t.after(() => {
        User.findOne = oldFindOne;
        Session.destroy = oldDestroy;
        sequelize.transaction = oldTransaction;
    });

    const response = responseRecorder();
    await authController.verifyOTP({
        body: {
            email: "person@example.com",
            otp: "123456",
            newPassword: "NewSecurePass_2",
            cnewPassword: "NewSecurePass_2"
        }
    }, response);

    assert.equal(response.statusCode, 400);
    assert.equal(response.payload.message, "Invalid or expired OTP");
    assert.equal(destroyed, false);
});

test("password reset reports a missing email service and clears the unusable code", async (t) => {
    const emailKey = process.env.EMAIL_USER;
    const passwordKey = process.env.EMAIL_PASS;
    const controllerPath = require.resolve("../controllers/authController");
    const mailPath = require.resolve("../utils/sendMail");
    const cachedController = require.cache[controllerPath];
    const cachedMail = require.cache[mailPath];
    const oldFindOne = User.findOne;
    const user = {
        id: 21,
        otp: null,
        otp_expires: null,
        update: async (values) => Object.assign(user, values),
        save: async () => {}
    };

    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
    delete require.cache[mailPath];
    delete require.cache[controllerPath];
    const controllerWithoutEmail = require("../controllers/authController");
    User.findOne = async () => user;

    t.after(() => {
        User.findOne = oldFindOne;
        if (emailKey === undefined) delete process.env.EMAIL_USER;
        else process.env.EMAIL_USER = emailKey;
        if (passwordKey === undefined) delete process.env.EMAIL_PASS;
        else process.env.EMAIL_PASS = passwordKey;
        if (cachedMail) require.cache[mailPath] = cachedMail;
        if (cachedController) require.cache[controllerPath] = cachedController;
    });

    const response = responseRecorder();
    await controllerWithoutEmail.forgetPassword({ body: { email: "person@example.com" } }, response);

    assert.equal(response.statusCode, 503);
    assert.equal(response.payload.message, "Password reset email is currently unavailable");
    assert.equal(user.otp, null);
    assert.equal(user.otp_expires, null);
});
