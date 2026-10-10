process.env.NODE_ENV = "test";
process.env.ACCESS_TOKEN_SECRET = "test-only-csrf-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const cookieParser = require("cookie-parser");
const { csrfProtection, issueCsrfToken, cookieOptions } = require("../middlewares/csrfProtection");

test("CSRF middleware accepts a signed double-submit token and rejects missing or forged tokens", async (t) => {
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use(csrfProtection);
    app.get("/csrf", (req, res) => {
        const csrfToken = issueCsrfToken();
        res.cookie("csrfToken", csrfToken, cookieOptions());
        res.json({ csrfToken });
    });
    app.post("/change", (req, res) => res.status(204).end());

    const server = app.listen(0);
    t.after(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const issued = await fetch(`${baseUrl}/csrf`);
    const { csrfToken } = await issued.json();
    const cookie = issued.headers.getSetCookie()[0].split(";")[0];

    const missing = await fetch(`${baseUrl}/change`, {
        method: "POST",
        headers: { Cookie: cookie },
    });
    assert.equal(missing.status, 403);

    const accepted = await fetch(`${baseUrl}/change`, {
        method: "POST",
        headers: { Cookie: cookie, "X-CSRF-Token": csrfToken },
    });
    assert.equal(accepted.status, 204);

    const forged = await fetch(`${baseUrl}/change`, {
        method: "POST",
        headers: { Cookie: cookie, "X-CSRF-Token": `${csrfToken}forged` },
    });
    assert.equal(forged.status, 403);
});
