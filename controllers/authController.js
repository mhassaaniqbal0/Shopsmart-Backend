// controllers/authController.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import User from "../models/user.js";
import sendEmail from "../utils/sendEmail.js";
import dotenv from "dotenv";
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// helper: sign access token
function signAccessToken(payload, expiresIn = "7d") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

// helper: hash (sha256 hex)
function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/* =========================
   REGISTER
   ========================= */
export const register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    // simple email check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ message: "Invalid email format" });

    // password strength (example)
    if (password.length < 6) return res.status(400).json({ message: "Password must be >= 6 characters" });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already registered" });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashed, phone, isVerified: true }); // mark verified if you want, or implement email verification separately
    await user.save();

    return res.status(201).json({ success: true, message: "User registered", user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error("register error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   LOGIN
   ========================= */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });
    const hashed = await bcrypt.hash(password, 10);
console.log('hashed password login',hashed)
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid email or password" });
console.log('user found',user)
    const ok = await bcrypt.compare(password, user.password);
    console.log('password match',ok)
    if (!ok) return res.status(400).json({ message: "Invalid email or password" });

    // if user has 2FA enabled -> create short-lived twoFactorToken and save OTP server-side (we will generate OTP on demand)
    if (user.twoFactor && user.twoFactor.enabled) {
      // generate numeric OTP (6 digits)
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const codeHash = sha256(code);
      const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

      // store hashed code and expiry in user.twoFactor.otp (one-time)
      user.twoFactor.otp = { codeHash, expiresAt };
      await user.save();

      // send OTP via email
      await sendEmail({
        to: user.email,
        subject: "Your ShopSmart login OTP",
        text: `Your login code is ${code}. It expires in 5 minutes.`,
        html: `<p>Your ShopSmart login code is <b>${code}</b>. It expires in 5 minutes.</p>`
      });

      // issue a short JWT token representing the 2FA session (very short expiry)
      const twoFactorToken = jwt.sign({ uid: user._id, action: "2fa" }, JWT_SECRET, { expiresIn: "7m" });
      return res.json({ twoFactorRequired: true, twoFactorToken, message: "2FA code sent to your email" });
    }

    const token = signAccessToken({ id: user._id, email: user.email });
    return res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   2FA VERIFY
   ========================= */
export const twoFactorVerify = async (req, res) => {
  try {
    const { twoFactorToken, code } = req.body;
    if (!twoFactorToken || !code) return res.status(400).json({ message: "Missing token or code" });

    // verify twoFactorToken
    let payload;
    try {
      payload = jwt.verify(twoFactorToken, JWT_SECRET);
    } catch (e) {
      return res.status(400).json({ message: "Invalid or expired 2FA session token" });
    }
    if (!payload || payload.action !== "2fa" || !payload.uid) {
      // For token shape in our code we used uid property
      // But earlier we signed with { uid: user._id } - check that
    }

    const uid = payload.uid || payload.id || payload.uid; // tolerate both

    const user = await User.findById(uid);
    if (!user) return res.status(400).json({ message: "Invalid 2FA session" });

    const otpRecord = user.twoFactor?.otp;
    if (!otpRecord || !otpRecord.codeHash || !otpRecord.expiresAt) {
      return res.status(400).json({ message: "No OTP found. Please login again." });
    }

    if (Date.now() > otpRecord.expiresAt) {
      // clear stored OTP
      user.twoFactor.otp = undefined;
      await user.save();
      return res.status(400).json({ message: "OTP expired. Please login again." });
    }

    // compare hashes
    if (sha256(code) !== otpRecord.codeHash) {
      return res.status(400).json({ message: "Invalid OTP code" });
    }

    // success -> remove OTP and issue normal access token
    user.twoFactor.otp = undefined;
    await user.save();

    const token = signAccessToken({ id: user._id, email: user.email });
    return res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error("2fa verify error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   SEND 2FA OTP MANUALLY (optional)
   ========================= */
export const twoFactorSend = async (req, res) => {
  // this endpoint is optional: you can call it to explicitly send an OTP to user's email
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });
    if (!(user.twoFactor && user.twoFactor.enabled)) return res.status(400).json({ message: "2FA not enabled for this user" });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = sha256(code);
    const expiresAt = Date.now() + 5 * 60 * 1000;

    user.twoFactor.otp = { codeHash, expiresAt };
    await user.save();

    await sendEmail({
      to: user.email,
      subject: "Your ShopSmart 2FA code",
      text: `Your login code is ${code}. It expires in 5 minutes.`,
      html: `<p>Your login code is <b>${code}</b>. It expires in 5 minutes.</p>`
    });

    return res.json({ success: true, message: "OTP sent to email" });
  } catch (err) {
    console.error("2fa send error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   ENABLE / DISABLE 2FA (simple implementations)
   Note: in production these should be protected endpoints (require auth).
   ========================= */
export const enableTwoFactor = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    user.twoFactor = { enabled: true };
    await user.save();
    return res.json({ success: true, message: "2FA enabled for this account" });
  } catch (err) {
    console.error("enable2fa error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const disableTwoFactor = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    user.twoFactor = { enabled: false, otp: undefined };
    await user.save();
    return res.json({ success: true, message: "2FA disabled for this account" });
  } catch (err) {
    console.error("disable2fa error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   GOOGLE SIGN-IN
   ========================= */
export const googleSignIn = async (req, res) => {
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
};

/* =========================
   FORGOT PASSWORD -> send reset link
   ========================= */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    const user = await User.findOne({ email });
    if (!user) {
      // do not reveal whether user exists — but for dev we can say OK
      return res.json({ success: true, message: "If that email exists, a reset link has been sent." });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetHash = sha256(resetToken);
    const expire = Date.now() + 60 * 60 * 1000; // 1 hour

    user.resetToken = resetHash;
    user.resetTokenExpire = expire;
    await user.save();

    const resetUrl = `${CLIENT_URL}/reset-password?token=${resetToken}&id=${user._id}`;

    await sendEmail({
      to: user.email,
      subject: "ShopSmart Password Reset",
      text: `Reset your password by visiting ${resetUrl}`,
      html: `<p>Click the link to reset your password (valid 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
    });

    return res.json({ success: true, message: "If that email exists, a reset link has been sent." });
  } catch (err) {
    console.error("forgotPassword error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   RESET PASSWORD
   ========================= */
export const resetPassword = async (req, res) => {
  try {
    const { id, token, newPassword } = req.body;
    if (!id || !token || !newPassword) return res.status(400).json({ message: "Missing data" });

    const hash = sha256(token);
    const user = await User.findOne({ _id: id, resetToken: hash, resetTokenExpire: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ message: "Invalid or expired reset token" });

    // update password
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetToken = undefined;
    user.resetTokenExpire = undefined;
    await user.save();

    return res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    console.error("resetPassword error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
