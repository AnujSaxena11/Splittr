const test = require("node:test");
const assert = require("node:assert/strict");
const { tokenBucketScript } = require("../middlewares/rateLimiter");

test("Redis token bucket script uses Redis time and performs atomic token accounting", () => {
    assert.match(tokenBucketScript, /redis\.call\('TIME'\)/);
    assert.match(tokenBucketScript, /redis\.call\('HMGET'/);
    assert.match(tokenBucketScript, /redis\.call\('HSET'/);
    assert.match(tokenBucketScript, /redis\.call\('PEXPIRE'/);
    assert.match(tokenBucketScript, /tokens >= 1/);
});
