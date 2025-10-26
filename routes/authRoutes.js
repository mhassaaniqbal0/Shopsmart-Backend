require("dotenv").config();
const express = require("express");
const { OAuth2Client } = require("google-auth-library");
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
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const JWT_SECRET = process.env.JWT_SECRET;
function signAccessToken(payload, expiresIn = "7d") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}
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
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: "Missing idToken" });
    if (!googleClient) return res.status(500).json({ message: "Google client not configured" });

    // verify idToken
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    if (!payload) return res.status(400).json({ message: "Invalid Google token" });
    const email = payload.email;
    const name = payload.name || payload.email.split("@")[0];
    const googleId = payload.sub;

    let user = await User.findOne({ email });
    if (!user) {
      // create new user, mark email verified
      user = new User({
        name,
        email,
        password: null,
        googleId,
        isVerified: true
      });
      await user.save();
    } else {
      // existing user: if googleId missing, attach it
      if (!user.googleId) {
        user.googleId = googleId;
        user.isVerified = true;
        await user.save();
      }
    }

    // create JWT
    const token = signAccessToken({ id: user._id, email: user.email });
    return res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error("googleSignIn error:", err);
    return res.status(500).json({ message: "Server error verifying Google token" });
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
