const crypto = require("crypto");

const cookieOptions = () => ({
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
  path: "/",
});

function csrfSecret() {
  const secret = process.env.CSRF_SECRET || process.env.ACCESS_TOKEN_SECRET;
  if (!secret) throw new Error("CSRF_SECRET or ACCESS_TOKEN_SECRET must be configured");
  return secret;
}

function signature(nonce) {
  return crypto.createHmac("sha256", csrfSecret()).update(nonce).digest("base64url");
}

function issueCsrfToken() {
  const nonce = `${Date.now()}.${crypto.randomBytes(32).toString("base64url")}`;
  return `${nonce}.${signature(nonce)}`;
}

function tokenIsValid(token) {
  if (typeof token !== "string") return false;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return false;
  const nonce = token.slice(0, separator);
  const issuedAt = Number(nonce.slice(0, nonce.indexOf(".")));
  if (!Number.isSafeInteger(issuedAt) || issuedAt > Date.now() || Date.now() - issuedAt > 8 * 60 * 60 * 1000) {
    return false;
  }
  const supplied = Buffer.from(token.slice(separator + 1));
  const expected = Buffer.from(signature(nonce));
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function csrfProtection(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.path === "/auth/google/callback") return next();

  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.get("x-csrf-token");
  if (
    !cookieToken ||
    !headerToken ||
    cookieToken !== headerToken ||
    !tokenIsValid(cookieToken)
  ) {
    return res.status(403).json({ message: "CSRF validation failed. Refresh the page and try again." });
  }
  return next();
}

module.exports = { csrfProtection, issueCsrfToken, cookieOptions };
