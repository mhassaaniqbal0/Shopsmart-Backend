// models/user.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  // Single display name, used for accounts created via Google sign-in
  // (which don't collect separate first/last name).
  name: { type: String },
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
  twoFactor: {
    enabled: { type: Boolean, default: false },
    otp: {
      codeHash: String,
      expiresAt: Number
    }
  },
  // ✅ Important: Add default role
  role: { type: String, enum: ["user", "admin"], default: "user" },

  // Rewards & Promotions fields
  coins: { type: Number, default: 0 },
  loyaltyPoints: { type: Number, default: 0 },
  purchaseCount: { type: Number, default: 0 },
  promotedProducts: { type: [String], default: [] },

  
  // Flash Deals personalization fields
  wishlist: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
  }],
  recentlyViewed: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  preferredPlatforms: [{
    type: String,
    enum: ["Daraz", "Telemart"],
  }],
});
  
// module.exports = mongoose.model("User", userSchema);
const User = mongoose.models.User || mongoose.model("User", userSchema);
module.exports = User;

