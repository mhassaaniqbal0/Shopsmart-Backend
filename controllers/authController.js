// controllers/authController.js
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const sendEmail = require("../utils/sendemail");
const crypto = require("crypto");

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ------------------------- SIGNUP -------------------------
exports.signup = async (req, res) => {
  try {
    const { firstName, lastName, email, password, gender, phone, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();

    const user = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      gender,
      phone,
      role: role || "user",
      otp,
      otpExpiry: Date.now() + 5 * 60 * 1000,
    });

    await sendEmail(email, "Verify your email", `Your OTP is ${otp}`);
    await user.save();

    res.status(201).json({ message: "Signup successful, please verify OTP" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ------------------------- VERIFY SIGNUP OTP -------------------------
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    if (user.otp !== otp || user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    res.json({ message: "Email verified successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ------------------------- LOGIN (STEP 1) -------------------------
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    if (!user.isVerified) {
      return res.status(400).json({ message: "Verify email first" });
    }

    // Generate OTP for login
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = Date.now() + 5 * 60 * 1000;
    await user.save();

    await sendEmail(email, "Login OTP", `Your OTP is ${otp}`);

    res.json({ message: "OTP sent to email, please verify to login" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ------------------------- VERIFY LOGIN OTP (STEP 2) -------------------------
exports.verifyLoginOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    if (user.otp !== otp || user.otpExpiry < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // ✅ Clear OTP fields
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    // ✅ Include both id and role in JWT
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // ✅ Return token + role
    res.json({
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ------------------------- FORGOT PASSWORD -------------------------
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetToken = resetToken;
    user.resetTokenExpiry = Date.now() + 30 * 60 * 1000; // 30 min
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    await sendEmail(
      email,
      "Password Reset",
      `Click here to reset your password: ${resetLink}`
    );

    res.json({ message: "Password reset link sent to your email" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ------------------------- RESET PASSWORD -------------------------
// controllers/authController.js
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword)
      return res.status(400).json({ message: "Missing fields" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.otp !== otp)
      return res.status(400).json({ message: "Invalid OTP" });

    if (Date.now() > user.otpExpiry)
      return res.status(400).json({ message: "OTP expired" });

    user.password = newPassword; // will be hashed in model
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
