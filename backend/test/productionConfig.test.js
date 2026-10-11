process.env.NODE_ENV = "test";
process.env.DB_NAME = "splitter_test";
process.env.DB_USER = "splitter_test";
process.env.DB_PASSWORD = "test-only-database-password";
process.env.DB_HOST = "127.0.0.1";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateProductionConfig } = require("../app");

test("production configuration requires secure origins, independent keys, and TLS services", () => {
    const original = { ...process.env };
    Object.assign(process.env, {
        NODE_ENV: "production",
        DB_NAME: "splitter",
        DB_USER: "splitter",
        DB_PASSWORD: "test-only-database-password",
        DB_HOST: "db.example.com",
        ACCESS_TOKEN_SECRET: "a".repeat(40),
        CSRF_SECRET: "b".repeat(40),
        OTP_SECRET: "c".repeat(40),
        REDIS_URL: "rediss://redis.example.com:6380",
        CORS_ORIGINS: "https://app.example.com",
        FRONTEND_URL: "https://app.example.com",
        GOOGLE_CLIENT_ID: "test-client-id",
        GOOGLE_CLIENT_SECRET: "test-client-secret",
        GOOGLE_CALLBACK_URL: "https://api.example.com/auth/google/callback",
        EMAIL_USER: "test@example.com",
        EMAIL_PASS: "test-only-mail-password",
        DB_SSL: "true",
        DB_SSL_REJECT_UNAUTHORIZED: "true"
    });

    try {
        assert.doesNotThrow(validateProductionConfig);
        process.env.CSRF_SECRET = process.env.ACCESS_TOKEN_SECRET;
        assert.throws(validateProductionConfig, /must be different/);
        process.env.CSRF_SECRET = "b".repeat(40);
        process.env.REDIS_URL = "redis://redis.example.com:6380";
        assert.throws(validateProductionConfig, /rediss:\/\/ TLS/);
        process.env.REDIS_URL = "rediss://redis.example.com:6380";
        process.env.CORS_ORIGINS = "https://app.example.com,http://bad.example.com";
        assert.throws(validateProductionConfig, /HTTPS origin/);
    } finally {
        for (const key of Object.keys(process.env)) {
            if (!(key in original)) delete process.env[key];
        }
        Object.assign(process.env, original);
    }
});
