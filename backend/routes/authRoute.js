const express = require("express");
const { createUser, loginUser, logoutUser, forgetPassword, verifyOTP, getMe, getUserById, logoutAllDevices, authRefreshToken } = require("../controllers/authController");
const router = express.Router();

const validate = require("../middlewares/validate");
const { signUpSchema, loginSchema, forgetPasswordSchema, verifyOTPSchema, googleNativeSignInSchema } = require("../validations/authValidator");
const authMiddleware = require("../middlewares/authMiddleware");
const { authRateLimit } = require("../middlewares/rateLimiter");
const { issueCsrfToken, cookieOptions } = require("../middlewares/csrfProtection");
const googleAuth = require("../controllers/googleAuthController");

router.get("/csrf", (req, res) => {
    const token = issueCsrfToken();
    res.cookie("csrfToken", token, { ...cookieOptions(), maxAge: 8 * 60 * 60 * 1000 });
    return res.status(200).json({ csrfToken: token });
});
router.get("/google", authRateLimit, googleAuth.startGoogleAuth);
router.get("/google/callback", authRateLimit, googleAuth.finishGoogleAuth);
router.post("/google/native", authRateLimit, validate(googleNativeSignInSchema), googleAuth.nativeGoogleSignIn);
router.post("/signup", authRateLimit, validate(signUpSchema), createUser);
router.post("/login", authRateLimit, validate(loginSchema), loginUser);
router.post("/logout", authRateLimit, authMiddleware, logoutUser);
router.post("/logoutAll", authRateLimit, authMiddleware, logoutAllDevices);
router.post("/forgetPassword", authRateLimit, validate(forgetPasswordSchema), forgetPassword);
router.post("/verifyOTP", authRateLimit, validate(verifyOTPSchema), verifyOTP);
router.post("/refresh", authRateLimit, authRefreshToken);
router.get("/me", authMiddleware, getMe);
router.get("/user/:id", authMiddleware, getUserById);

module.exports = router;