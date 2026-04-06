const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    default: 'My Wishlist'
  },
  description: {
    type: String
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  products: [{
    productId: {
      type: String, // Can be from Daraz or Alibaba
      required: true
    },
    productName: String,
    price: String,
    image: String,
    platform: {
      type: String,
      enum: ['daraz', 'alibaba'],
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  shareToken: {
    type: String,
    unique: true,
    sparse: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Wishlist', wishlistSchema);
