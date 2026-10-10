const jwt = require("jsonwebtoken");
const { User, Session } = require("../config/dbconfig");

async function authMiddleware(req, res, next) {
  const token = req.cookies?.accessToken || req.cookies?.token || (req.headers.authorization && req.headers.authorization.startsWith("Bearer ") ? req.headers.authorization.split(" ")[1] : null);
  if (!token) {
    return res.status(401).json({ message: "Unauthorized access" });
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const userId = decoded.userId || decoded.user_id;
    if (!decoded.session_id) {
      return res.status(401).json({ message: "Session is no longer active" });
    }
    const session = await Session.findByPk(decoded.session_id);
    if (
      !session ||
      Number(session.userId) !== Number(userId) ||
      session.revoked_at ||
      new Date(session.expires_at) <= new Date()
    ) {
      return res.status(401).json({ message: "Session is no longer active" });
    }
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    req.user = {
      id: user.id,
      userId: user.id,
      user_id: user.id,
      name: user.name,
      email: user.email,
      sessionId: session.id,
    };
    return next();
  } catch (e) {
    if (e.name !== "JsonWebTokenError" && e.name !== "TokenExpiredError" && e.name !== "NotBeforeError") {
      return next(e);
    }
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = authMiddleware;
