process.env.ACCESS_TOKEN_SECRET = "test-only-google-oauth-secret";
process.env.NODE_ENV = "test";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.GOOGLE_CALLBACK_URL = "http://localhost:8080/auth/google/callback";
process.env.FRONTEND_URL = "http://localhost:5173";

const test = require("node:test");
const assert = require("node:assert/strict");
const { OAuth2Client } = require("google-auth-library");
const { sequelize, User, Session } = require("../config/dbconfig");
const googleAuth = require("../controllers/googleAuthController");

function responseRecorder() {
    return {
        cookies: [],
        statusCode: 200,
        cookie(name, value, options) {
            this.cookies.push({ name, value, options });
            return this;
        },
        clearCookie(name) {
            this.cookies.push({ name, value: "", cleared: true });
            return this;
        },
        redirect(target) {
            this.redirectTarget = target;
            return this;
        }
    };
}

test("Google OAuth validates state and creates a server-side session for a verified identity", async (t) => {
    const originals = {
        generateCodeVerifierAsync: OAuth2Client.prototype.generateCodeVerifierAsync,
        generateAuthUrl: OAuth2Client.prototype.generateAuthUrl,
        getToken: OAuth2Client.prototype.getToken,
        request: OAuth2Client.prototype.request,
        setCredentials: OAuth2Client.prototype.setCredentials,
        transaction: sequelize.transaction,
        findUser: User.findOne,
        createUser: User.create,
        createSession: Session.create
    };
    let createdUser;
    let createdSession;

    OAuth2Client.prototype.generateCodeVerifierAsync = async () => ({
        codeVerifier: "pkce-verifier",
        codeChallenge: "pkce-challenge"
    });
    OAuth2Client.prototype.generateAuthUrl = () => "https://accounts.google.test/authorize";
    OAuth2Client.prototype.getToken = async () => ({ tokens: { access_token: "google-access-token" } });
    OAuth2Client.prototype.request = async () => ({
        data: { sub: "google-user-1", email: "person@example.com", email_verified: true, name: "Person" }
    });
    OAuth2Client.prototype.setCredentials = function (credentials) {
        this.credentials = credentials;
    };
    sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } });
    User.findOne = async () => null;
    User.create = async (values) => {
        createdUser = { id: 52, ...values };
        return createdUser;
    };
    Session.create = async (values) => {
        createdSession = { id: 77, ...values };
        return createdSession;
    };
    t.after(() => {
        Object.assign(OAuth2Client.prototype, {
            generateCodeVerifierAsync: originals.generateCodeVerifierAsync,
            generateAuthUrl: originals.generateAuthUrl,
            getToken: originals.getToken,
            request: originals.request,
            setCredentials: originals.setCredentials
        });
        sequelize.transaction = originals.transaction;
        User.findOne = originals.findUser;
        User.create = originals.createUser;
        Session.create = originals.createSession;
    });

    const startResponse = responseRecorder();
    await googleAuth.startGoogleAuth({ get: () => "test-agent" }, startResponse);
    assert.equal(startResponse.redirectTarget, "https://accounts.google.test/authorize");
    assert.ok(startResponse.cookies.some((cookie) => cookie.name === "googleOAuthState"));
    assert.ok(startResponse.cookies.some((cookie) => cookie.name === "googleOAuthVerifier"));

    const state = "random-state";
    const callbackResponse = responseRecorder();
    await googleAuth.finishGoogleAuth({
        query: { code: "google-code", state },
        cookies: { googleOAuthState: state, googleOAuthVerifier: "pkce-verifier" },
        get: () => "test-agent",
        ip: "127.0.0.1"
    }, callbackResponse);

    assert.equal(createdUser.email, "person@example.com");
    assert.equal(createdUser.password, null);
    assert.equal(createdUser.google_id, "google-user-1");
    assert.equal(createdSession.userId, createdUser.id);
    assert.equal(callbackResponse.redirectTarget, "http://localhost:5173/?oauth=success");
    assert.ok(callbackResponse.cookies.some((cookie) => cookie.name === "accessToken"));
    assert.ok(callbackResponse.cookies.some((cookie) => cookie.name === "refreshToken"));

    const invalidResponse = responseRecorder();
    await googleAuth.finishGoogleAuth({
        query: { code: "google-code", state: "forged-state" },
        cookies: { googleOAuthState: state, googleOAuthVerifier: "pkce-verifier" },
        get: () => "test-agent",
        ip: "127.0.0.1"
    }, invalidResponse);
    assert.equal(invalidResponse.redirectTarget, "http://localhost:5173/?oauth=failed");
});
