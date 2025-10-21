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
const User = require("../models/user");
const sendEmail = require("../utils/sendemail"); // ✅ import email helper

const router = express.Router();

// ✅ Google OAuth (browser redirect fallback)
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/" }),
  (req, res) => {
    const token = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ message: "Google login successful", token });
  }
);

// ✅ Token-based Google Login + OTP (used by frontend)
router.post("/google", async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email)
      return res.status(400).json({ message: "Email missing in request" });

    // ✅ Check or create user
    let user = await User.findOne({ email });
    if (!user) {
      const [firstName, ...rest] = (name || "Google User").split(" ");
      const lastName = rest.join(" ");
      user = new User({
        firstName,
        lastName,
        email,
        isVerified: true,
        googleId: "GOOGLE_DIRECT",
        role: "user",
      });
      await user.save();
    }

    // ✅ Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpiry = Date.now() + 5 * 60 * 1000; // valid for 5 mins
    await user.save();

    // ✅ Send email asynchronously (non-blocking)
    sendEmail(user.email, "Google Login OTP", `Your OTP is ${otp}`)
      .then(() => console.log("✅ OTP email sent:", user.email))
      .catch((err) => console.error("❌ Email send failed:", err));

    // ✅ Respond immediately (no wait)
    return res.json({
      message: "OTP sent to your email, please verify to login",
      success: true,
    });
  } catch (err) {
    console.error("❌ Google login error:", err);
    res.status(500).json({ message: "Google auth failed", error: err.message });
  }
});

// ✅ OTP / Password routes
router.post("/signup", signup);
router.post("/verify-otp", verifyOTP);
router.post("/login", login);
router.post("/verify-login-otp", verifyLoginOTP);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
