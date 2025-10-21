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

const router = express.Router();

// ✅ Google OAuth redirect (kept for browser-based login)
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/" }),
  (req, res) => {
    const token = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ message: "Google login successful", token });
  }
);

// ✅ Token-based Google Login (used by frontend)
router.post("/google", async (req, res) => {
  try {
    const { email, name } = req.body;
    let user = await User.findOne({ email });

    if (!user) {
      const [firstName, ...lastParts] = name.split(" ");
      const lastName = lastParts.join(" ");
      user = new User({
        firstName,
        lastName,
        email,
        isVerified: true,
        googleId: "GOOGLE_DIRECT",
        gender: "Other",
        phone: "N/A",
      });
      await user.save();
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ token, message: "Google login successful" });
  } catch (err) {
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
