const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const { sequelize, User, Session } = require("../config/dbconfig");

const oauthCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/auth/google",
  maxAge: 10 * 60 * 1000,
});

function getClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALLBACK_URL) {
    throw new Error("Google OAuth is not configured");
  }
  return new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL);
}

function frontendRedirect(result) {
  const base = process.env.FRONTEND_URL || process.env.CORS_ORIGINS?.split(",")[0] || "http://localhost:5173";
  const target = new URL("/", base);
  target.searchParams.set("oauth", result);
  return target.toString();
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

exports.startGoogleAuth = async (req, res) => {
  try {
    const client = getClient();
    const state = crypto.randomBytes(32).toString("base64url");
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    res.cookie("googleOAuthState", state, oauthCookieOptions());
    res.cookie("googleOAuthVerifier", codeVerifier, oauthCookieOptions());
    return res.redirect(client.generateAuthUrl({
      access_type: "online",
      prompt: "select_account",
      scope: ["openid", "email", "profile"],
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    }));
  } catch (error) {
    console.error("Google OAuth initiation failed:", error.message);
    return res.redirect(frontendRedirect("unavailable"));
  }
};

exports.finishGoogleAuth = async (req, res) => {
  const clearOAuthCookies = () => {
    res.clearCookie("googleOAuthState", oauthCookieOptions());
    res.clearCookie("googleOAuthVerifier", oauthCookieOptions());
  };

  try {
    const state = req.query.state;
    const code = req.query.code;
    const verifier = req.cookies?.googleOAuthVerifier;
    if (!safeEqual(state, req.cookies?.googleOAuthState) || !code || !verifier) {
      clearOAuthCookies();
      return res.redirect(frontendRedirect("failed"));
    }

    const client = getClient();
    const { tokens } = await client.getToken({ code, codeVerifier: verifier });
    if (!tokens.access_token) throw new Error("Google did not return an access token");
    client.setCredentials(tokens);
    const { data: profile } = await client.request({
      url: "https://openidconnect.googleapis.com/v1/userinfo",
    });
    if (!profile.email || profile.email_verified !== true || !profile.sub) {
      throw new Error("Google account email is not verified");
    }

    const session = await sequelize.transaction(async (transaction) => {
      let user = await User.findOne({
        where: { google_id: profile.sub },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!user) {
        user = await User.findOne({
          where: { email: profile.email.toLowerCase() },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (user?.google_id && user.google_id !== profile.sub) {
          throw new Error("Google account is linked to another user");
        }
        if (user) {
          await user.update({ google_id: profile.sub }, { transaction });
        } else {
          user = await User.create({
            name: profile.name || profile.email.split("@")[0],
            email: profile.email.toLowerCase(),
            password: null,
            google_id: profile.sub,
          }, { transaction });
        }
      }

      const refreshToken = crypto.randomBytes(64).toString("hex");
      const authSession = await Session.create({
        userId: user.id,
        token_hash: crypto.createHash("sha256").update(refreshToken).digest("hex"),
        device_name: req.get("user-agent") || "Unknown",
        user_browser: req.get("user-agent") || "Unknown",
        ip_address: req.ip || "Unknown",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }, { transaction });
      return { user, authSession, refreshToken };
    });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      path: "/",
    };
    const jwt = require("jsonwebtoken");
    const accessToken = jwt.sign(
      { userId: session.user.id, session_id: session.authSession.id },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "15m" },
    );
    res.cookie("refreshToken", session.refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.cookie("accessToken", accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    clearOAuthCookies();
    return res.redirect(frontendRedirect("success"));
  } catch (error) {
    console.error("Google OAuth callback failed:", error.message);
    clearOAuthCookies();
    return res.redirect(frontendRedirect("failed"));
  }
};
