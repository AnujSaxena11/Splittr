const express = require('express');
const app = express();
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const dotenv = require('dotenv');
dotenv.config();

const { connectDB, sequelize } = require("./config/dbconfig");
const { connectRateLimitStore, closeRateLimitConnection } = require("./middlewares/rateLimiter");
const { attachRealtime, closeRealtime } = require("./services/realtime");
const authRoute = require("./routes/authRoute");
const groupRoute = require("./routes/groupRoute");
const expenseRoute = require("./routes/expenseRoute");
const selfExpenseRoute = require("./routes/selfExpenseRoute");
const reportRoute = require("./routes/reportRoute");
const notificationRoute = require("./routes/notificationRoute");

const configuredOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
const allowedOrigins = new Set(process.env.NODE_ENV === "production"
    ? configuredOrigins
    : ['http://localhost:5173', 'http://localhost:5174', ...configuredOrigins]);

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    credentials: true,
};
const { apiRateLimit } = require("./middlewares/rateLimiter");
const { csrfProtection } = require("./middlewares/csrfProtection");

app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
app.use(helmet());
app.use(cors(corsOptions));
app.use(apiRateLimit);
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true, limit: "32kb" }));
app.use(cookieParser());
app.use(csrfProtection);

app.use("/auth", authRoute);
app.use("/self", selfExpenseRoute);
app.use("/group", groupRoute);
app.use("/expense-splitter", expenseRoute);
app.use("/reports", reportRoute);
app.use("/notifications", notificationRoute);

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === "entity.too.large") {
        return res.status(413).json({ message: "Request body is too large." });
    }
    if (error.message === "Not allowed by CORS") {
        return res.status(403).json({ message: "Origin is not allowed." });
    }
    console.error("Unhandled request error:", error);
    return res.status(500).json({ message: "Internal server error." });
});

function validateProductionConfig() {
    const required = [
        "DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST", "ACCESS_TOKEN_SECRET",
        "CSRF_SECRET", "OTP_SECRET", "REDIS_URL", "CORS_ORIGINS", "FRONTEND_URL",
        "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_CALLBACK_URL",
        "EMAIL_USER", "EMAIL_PASS",
    ];
    const missing = required.filter((name) => !process.env[name]);
    if (missing.length) throw new Error(`Missing required production configuration: ${missing.join(", ")}`);
    if (process.env.ACCESS_TOKEN_SECRET.length < 32) {
        throw new Error("ACCESS_TOKEN_SECRET must contain at least 32 characters in production");
    }
    if (process.env.CSRF_SECRET.length < 32) {
        throw new Error("CSRF_SECRET must contain at least 32 characters in production");
    }
    if (process.env.CSRF_SECRET === process.env.ACCESS_TOKEN_SECRET) {
        throw new Error("ACCESS_TOKEN_SECRET and CSRF_SECRET must be different");
    }
    if (process.env.OTP_SECRET.length < 32) {
        throw new Error("OTP_SECRET must contain at least 32 characters in production");
    }
    if ([process.env.ACCESS_TOKEN_SECRET, process.env.CSRF_SECRET].includes(process.env.OTP_SECRET)) {
        throw new Error("ACCESS_TOKEN_SECRET, CSRF_SECRET, and OTP_SECRET must all be different");
    }
    const allowedOrigins = process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim());
    for (const origin of allowedOrigins) {
        const parsedOrigin = new URL(origin);
        if (parsedOrigin.origin !== origin || parsedOrigin.protocol !== "https:") {
            throw new Error("Every production CORS origin must be an HTTPS origin without a path");
        }
    }
    if (!allowedOrigins.includes(process.env.FRONTEND_URL)) {
        throw new Error("FRONTEND_URL must be included in CORS_ORIGINS");
    }
    const frontendUrl = new URL(process.env.FRONTEND_URL);
    const callbackUrl = new URL(process.env.GOOGLE_CALLBACK_URL);
    if (frontendUrl.origin !== process.env.FRONTEND_URL || frontendUrl.protocol !== "https:") {
        throw new Error("FRONTEND_URL must be an HTTPS origin without a path");
    }
    if (callbackUrl.protocol !== "https:") {
        throw new Error("GOOGLE_CALLBACK_URL must use HTTPS in production");
    }
    if (new URL(process.env.REDIS_URL).protocol !== "rediss:") {
        throw new Error("REDIS_URL must use rediss:// TLS in production");
    }
    if (process.env.DB_SSL === "false" || process.env.DB_SSL_REJECT_UNAUTHORIZED === "false") {
        throw new Error("Production PostgreSQL TLS must be enabled with certificate verification");
    }
}

async function start() {
    if (process.env.NODE_ENV === "production") validateProductionConfig();
    try {
        await connectDB();
        await connectRateLimitStore();
    } catch (error) {
        await Promise.allSettled([closeRateLimitConnection(), sequelize.close()]);
        throw error;
    }

    const port = Number(process.env.PORT || 8080);
    const server = app.listen(port, () => console.log(`Splitter API listening on port ${port}`));
    attachRealtime(server);

    let shuttingDown = false;
    async function shutdown(signal) {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`Received ${signal}; closing server`);
        try {
            await closeRealtime();
            await closeRateLimitConnection();
            await sequelize.close();
            process.exit(0);
        } catch (shutdownError) {
            console.error("Graceful shutdown failed:", shutdownError);
            process.exit(1);
        }
    }
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));
    return server;
}

if (require.main === module) {
    start().catch((error) => {
        console.error("Unable to start Splitter API:", error.message);
        process.exitCode = 1;
    });
}

module.exports = app;
module.exports.start = start;
module.exports.validateProductionConfig = validateProductionConfig;