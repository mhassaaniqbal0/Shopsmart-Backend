// backend/models/Wishlist.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const WishlistItemSchema = new Schema({
  productId: { type: String, required: true },
  platform: { type: String },
  lastKnownPrice: { type: Number },
  targetPrice: { type: Number },
  addedAt: { type: Date, default: Date.now },
  notes: { type: String }
}, { _id: true });

const WishlistSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: 'Untitled Wishlist' },
  description: { type: String },
  isPublic: { type: Boolean, default: false },
  sharedToken: { type: String },
  items: { type: [WishlistItemSchema], default: [] }
}, { timestamps: true });

WishlistSchema.index({ owner: 1, title: 1 });

module.exports = mongoose.model('Wishlist', WishlistSchema);
