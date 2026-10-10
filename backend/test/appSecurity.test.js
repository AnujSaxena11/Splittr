process.env.NODE_ENV = "test";
process.env.DB_NAME = "splitter_test";
process.env.DB_USER = "splitter_test";
process.env.DB_PASSWORD = "splitter_test";
process.env.DB_HOST = "127.0.0.1";
process.env.ACCESS_TOKEN_SECRET = "test-only-app-security-secret";
process.env.CSRF_SECRET = "test-only-csrf-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../app");

test("application wiring sets security headers and enforces CSRF before auth handlers", async (t) => {
    const server = app.listen(0);
    t.after(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const csrf = await fetch(`${baseUrl}/auth/csrf`);
    assert.equal(csrf.status, 200);
    assert.equal(csrf.headers.get("x-content-type-options"), "nosniff");
    const { csrfToken } = await csrf.json();
    const cookie = csrf.headers.getSetCookie().find((header) => header.startsWith("csrfToken=")).split(";")[0];

    const rejected = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "person@example.com", password: "password" })
    });
    assert.equal(rejected.status, 403);

    const validated = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
            "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify({ email: "not-an-email", password: "password" })
    });
    assert.equal(validated.status, 400);
});
