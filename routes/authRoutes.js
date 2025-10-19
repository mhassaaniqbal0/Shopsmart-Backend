const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const {
  signup,
  verifyOTP,
  login,
  verifyLoginOTP,
  resetPassword,
  forgotPassword,
} = require("../controllers/authController");

const router = express.Router();

// 🔐 Google OAuth Routes
router.get("/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/" }),
  (req, res) => {
    const token = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ message: "Google login successful", token });
  }
);

// 🔐 OTP & Password Routes
router.post("/signup", signup);
router.post("/verify-otp", verifyOTP);
router.post("/login", login);
router.post("/verify-login-otp", verifyLoginOTP);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
