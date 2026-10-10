const { sequelize, User, Session } = require("../config/dbconfig");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendMail");
const crypto = require("crypto");
const { disconnectSession, disconnectUser } = require("../services/realtime");

const saltRounds = 12;
const accessRefresh = process.env.ACCESS_TOKEN_SECRET;
const dummyPasswordHash = bcrypt.hash(crypto.randomBytes(32).toString("hex"), saltRounds);


async function hashPass(password) {
    const salt = await bcrypt.genSalt(saltRounds);
    return bcrypt.hash(password, salt);
}

async function comparePass(plainPass, hashedPass) {
    return bcrypt.compare(plainPass, hashedPass);
}

async function hashToken(token) {
    return crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
}

function hashOtp(otp) {
    const secret = process.env.OTP_SECRET || process.env.ACCESS_TOKEN_SECRET;
    if (!secret) throw new Error("OTP_SECRET or ACCESS_TOKEN_SECRET must be configured");
    return crypto.createHmac("sha256", secret).update(otp).digest("hex");
}

const getCookieOptions = () => ({
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
  secure: process.env.NODE_ENV === "production",
  path: "/",
});

exports.createUser = async (req, res) => {
    try {
        const { name, email, password, cpassword } = req.body;
        if (password !== cpassword) {
            return res.status(400).json({ message: "Passwords do not match" });
        }
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ message: "An account with this email already exists" });
        }
        const hashedPassword = await hashPass(password);
        const sessionData = await sequelize.transaction(async (transaction) => {
            const newUser = await User.create({ name, email: email.toLowerCase(), password: hashedPassword }, { transaction });
            const refreshToken = crypto.randomBytes(64).toString('hex');
            const session = await Session.create({
                userId: newUser.id,
                token_hash: await hashToken(refreshToken),
                device_name: req.headers['user-agent'] || 'Unknown',
                user_browser: req.headers['user-agent'] || 'Unknown',
                ip_address: req.ip || 'Unknown',
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            }, { transaction });
            return { newUser, refreshToken, session };
        });
        const { newUser, refreshToken, session } = sessionData;

        const accessPayload = {
            userId: newUser.id,
            session_id: session.id
        };

        const accessToken = jwt.sign(accessPayload, accessRefresh, { expiresIn: '15m' });

        res.cookie("refreshToken", refreshToken, {
            ...getCookieOptions(),
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        res.cookie("accessToken", accessToken, {
            ...getCookieOptions(),
            maxAge: 15 * 60 * 1000, // 15 minutes
        });

        return res.status(201).json({
            message: "User created successfully",
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                createdAt: newUser.createdAt,
                updatedAt: newUser.updatedAt
            }
        });
    }
    catch (e) {
        if (e.name === "SequelizeUniqueConstraintError") {
            return res.status(409).json({ message: "An account with this email already exists" });
        }
        console.error("Error creating user: ", e);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ where: { email } });
        const isMatch = await comparePass(password, user?.password || await dummyPasswordHash);
        if (!user?.password || !isMatch) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const refreshToken = crypto.randomBytes(64).toString('hex');
        
        const session = await Session.create({
            userId: user.id,
            token_hash: await hashToken(refreshToken),
            device_name: req.headers['user-agent'] || 'Unknown',
            user_browser: req.headers['user-agent'] || 'Unknown',
            ip_address: req.ip || 'Unknown',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        });

        const accessPayload = {
            userId: user.id,
            session_id: session.id
        };

        const accessToken = jwt.sign(accessPayload, accessRefresh, { expiresIn: '15m' });

        res.cookie("refreshToken", refreshToken, {
            ...getCookieOptions(),
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        res.cookie("accessToken", accessToken, {
            ...getCookieOptions(),
            maxAge: 15 * 60 * 1000, // 15 minutes
        });
        
        return res.status(200).json({ message: "Login successful" });
    }
    catch (e) {
        console.error("Error logging in user: ", e);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.logoutUser = async (req, res) => {
    try {
        await Session.destroy({ where: { id: req.user.sessionId, userId: req.user.userId } });
        disconnectSession(req.user.sessionId);

        res.clearCookie("accessToken", getCookieOptions());
        res.clearCookie("refreshToken", getCookieOptions());

        return res.status(200).json({ message: "Logged out" });
    }
    catch (e) {
        console.error("Logout error", e);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.logoutAllDevices = async (req, res) => {
    try{
        const userId = req.user.userId;
        await sequelize.transaction(async (transaction) => {
            await Session.destroy({ where: { userId }, transaction });
        });
        disconnectUser(userId);

        res.clearCookie("accessToken", getCookieOptions());
        res.clearCookie("refreshToken", getCookieOptions());

        return res.status(200).json({ message: "Logged out from all devices" });
    }
    catch(e){
        console.error("Logout all devices error", e);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.forgetPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ where: { email } });
        if(!user){
            return res.status(200).json({ message: "If an account exists for that email, a reset code will be sent." });
        }
        const otp = crypto.randomInt(100000, 1000000);
        const otp_expires = new Date(Date.now() + 10*60*1000);
        try {
            await user.update({ otp: hashOtp(otp.toString()), otp_expires });
            await sendEmail(email, "Password Reset OTP", `Your OTP for password reset is: ${otp}. It is valid for 10 minutes.`);
        } catch (emailError) {
            await user.update({ otp: null, otp_expires: null });
            console.error("Unable to send password reset email:", emailError);
            return res.status(503).json({ message: "Password reset email is currently unavailable" });
        }
        return res.status(200).json({ message: "OTP sent to email" });

    }
    catch (e) {
        console.error("Error in forget password: ", e);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.verifyOTP = async (req, res) => {
    try{
        const { email, otp, newPassword, cnewPassword } = req.body;
        if(newPassword !== cnewPassword){
            return res.status(400).json({ message: "Passwords do not match" });
        }
        const result = await sequelize.transaction(async (transaction) => {
            const user = await User.findOne({
                where: { email },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!user || !user.otp || !user.otp_expires ||
                user.otp !== hashOtp(otp) || new Date(user.otp_expires) <= new Date()) {
                return { error: "Invalid or expired OTP" };
            }
            if (user.password && await comparePass(newPassword, user.password)) {
                return { error: "New password cannot be same as old password" };
            }
            user.password = await hashPass(newPassword);
            user.otp = null;
            user.otp_expires = null;
            await user.save({ transaction });
            await Session.destroy({ where: { userId: user.id }, transaction });
            return { success: true };
        });
        if (result.error) return res.status(400).json({ message: result.error });
        return res.status(200).json({ message: "Password reset successful" });
    }
    catch(e){
        console.error("Error in verify OTP: ", e);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.getMe = async (req, res) => {
    try{
        const userId = req.user.userId;
        const user = await User.findByPk(userId, {
            attributes: ['id', 'name', 'email']
        });
        return res.status(200).json({ user });
    }
    catch(e){
        console.error("Error fetching user: ", e);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.getUserById = async (req, res) =>{
    try{
        const userId = req.params.id;
        const user = await User.findByPk(userId, {
            attributes: ['id', 'name', 'email']
        });
        return res.status(200).json({ user });
    }
    catch(e){
        console.error("Error fetching user: ", e);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.authRefreshToken = async (req, res) => {
    try{
        const refreshToken = req.cookies.refreshToken;
        if(!refreshToken){
            return res.status(401).json({ message: "Unauthorized" });
        }
        const hashedToken = await hashToken(refreshToken);
        const rotation = await sequelize.transaction(async (transaction) => {
            const session = await Session.findOne({
                where: { token_hash: hashedToken },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!session) return { error: "Invalid or expired refresh token" };
            if (session.revoked_at || new Date(session.expires_at) <= new Date()) {
                await Session.destroy({ where: { id: session.id }, transaction });
                return { error: "Invalid or expired refresh token" };
            }
            const newRefreshToken = crypto.randomBytes(64).toString('hex');
            session.token_hash = await hashToken(newRefreshToken);
            session.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            session.last_used_at = new Date();
            await session.save({ transaction });
            return { session, newRefreshToken };
        });
        if (rotation.error) return res.status(401).json({ message: rotation.error });
        const { session, newRefreshToken } = rotation;

        const accessPayload = {
            userId: session.userId,
            session_id: session.id
        };

        const newAccessToken = jwt.sign(accessPayload, accessRefresh, { expiresIn: '15m' });

        res.cookie("refreshToken", newRefreshToken, {
            ...getCookieOptions(),
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.cookie("accessToken", newAccessToken, {
            ...getCookieOptions(),
            maxAge: 15 * 60 * 1000,
        });

        return res.status(200).json({ message: "Token refreshed" });
    }
    catch(e){
        console.error("Error refreshing token: ", e);
        return res.status(500).json({ message: "Internal server error"});
    }
}

module.exports = {
    createUser: exports.createUser,
    loginUser: exports.loginUser,
    logoutUser: exports.logoutUser,
    logoutAllDevices: exports.logoutAllDevices,
    forgetPassword: exports.forgetPassword,
    verifyOTP: exports.verifyOTP,
    getMe: exports.getMe,
    getUserById: exports.getUserById,
    authRefreshToken: exports.authRefreshToken,
    hashPass,
    comparePass
};