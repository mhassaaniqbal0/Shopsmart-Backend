// routes/authRoutes.js
import express from "express";
import {
  register,
  login,
  googleSignIn,
  forgotPassword,
  resetPassword,
  twoFactorVerify,
  twoFactorSend,
  enableTwoFactor,
  disableTwoFactor
} from "../controllers/authController.js";

const router = express.Router();

// public
router.post("/register", register);
router.post("/login", login);
router.post("/google", googleSignIn);

// password recovery
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// 2FA email OTP - flows
// send OTP (optional endpoint to explicitly send OTP if you want)
router.post("/2fa/send", twoFactorSend);

// verify OTP (after login when twoFactorRequired was returned)
router.post("/2fa/verify", twoFactorVerify);

// optional: enable/disable 2FA for logged-in users (requires auth middleware normally)
router.post("/2fa/enable", enableTwoFactor);
router.post("/2fa/disable", disableTwoFactor);

export default router;
