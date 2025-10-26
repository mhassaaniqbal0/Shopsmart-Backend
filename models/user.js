// models/user.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  firstName: { type: String  },
  lastName: { type: String  },
  email: { type: String, unique: true },
  password: { type: String },
  gender: { type: String, enum: ["Male", "Female", "Other"], required: false },
  phone: { type: String, required: false },
  isVerified: { type: Boolean, default: false },
  otp: { type: String },
  otpExpiry: { type: Date },
  googleId: { type: String },
  resetToken: { type: String },
  resetTokenExpiry: { type: Date },

  // ✅ Important: Add default role
  role: { type: String, enum: ["user", "admin"], default: "user" },
});

module.exports = mongoose.model("User", userSchema);
