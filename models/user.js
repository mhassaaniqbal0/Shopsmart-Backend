// backend/models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { Schema } = mongoose;

// Embedded wishlist schemas (optional — will not break existing users)
const WishlistItemSchema = new Schema({
  productId: { type: String, required: true },
  platform: { type: String },
  lastKnownPrice: { type: Number },
  targetPrice: { type: Number },
  addedAt: { type: Date, default: Date.now },
  notes: { type: String }
}, { _id: true });

const WishlistSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  isPublic: { type: Boolean, default: false },
  sharedToken: { type: String },
  items: { type: [WishlistItemSchema], default: [] }
}, { timestamps: true, _id: true });

// minimal required fields (JS)
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, default: null },
  phone: String,
  isVerified: { type: Boolean, default: false },
  googleId: String,
  resetToken: String,
  resetTokenExpire: Date,
  twoFactor: {
    enabled: { type: Boolean, default: false },
    otp: {
      codeHash: String,
      expiresAt: Number
    }
  },
  // Optional embedded wishlists (use only if you pick embed strategy)
  wishlists: { type: [WishlistSchema], default: [] }
}, { timestamps: true });

/**
 * Hide sensitive fields when converting to JSON (e.g., res.json(user))
 */
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetToken;
  delete obj.resetTokenExpire;
  if (obj.twoFactor) {
    delete obj.twoFactor.otp;
  }
  return obj;
};

/**
 * Instance helper to compare plaintext password with hashed password
 */
userSchema.methods.comparePassword = async function (plain) {
  if (!this.password) return false;
  return bcrypt.compare(plain, this.password);
};

/**
 * Pre-save: if password modified, hash it
 */
userSchema.pre('save', async function (next) {
  const user = this;
  if (!user.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(user.password, salt);
    user.password = hash;
    return next();
  } catch (err) {
    return next(err);
  }
});

const User = mongoose.models.User || mongoose.model("User", userSchema);
export default User;
