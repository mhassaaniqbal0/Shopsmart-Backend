const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    previousPrice: {
      type: Number,
      min: 0,
      default: null, // Track previous price for discount calculation
    },
    productImage: {
      type: String,
      trim: true,
    },
    productUrl: {
      type: String,
      required: true,
      trim: true,
    },
    brand: {
      type: String,
      trim: true,
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: null,
    },
    availability: {
      type: String,
      trim: true,
    },
    platform: {
      type: String,
      required: true,
      enum: ["Daraz", "Telemart"],
      trim: true,
    },
    // Flash Deal fields
    discountPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    dealType: {
      type: String,
      enum: ["FLASH_SALE", "DISCOUNTED", "BUNDLE", null],
      default: null,
    },
    isBestValue: {
      type: Boolean,
      default: false,
    },
    valueScore: {
      type: Number,
      default: 0, // Calculated as rating / price
    },
    expiryTime: {
      type: Date,
      default: null, // Dynamic expiry for limited time offers
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
productSchema.index({ productName: 1, platform: 1 });
productSchema.index({ platform: 1, dealType: 1 });
productSchema.index({ isBestValue: 1, valueScore: -1 });
productSchema.index({ expiryTime: 1 });
productSchema.index({ discountPercentage: -1 });

// Virtual to calculate discount percentage if previousPrice exists
productSchema.virtual("calculatedDiscount").get(function () {
  if (this.previousPrice && this.previousPrice > this.price) {
    return Math.round(
      ((this.previousPrice - this.price) / this.previousPrice) * 100
    );
  }
  return this.discountPercentage || 0;
});

// Pre-save middleware to calculate valueScore and update discountPercentage
productSchema.pre("save", function (next) {
  // Calculate valueScore (rating / price)
  if (this.rating && this.price > 0) {
    this.valueScore = this.rating / this.price;
  } else {
    this.valueScore = 0;
  }

  // Calculate discount percentage if previousPrice exists
  if (this.previousPrice && this.previousPrice > this.price) {
    this.discountPercentage = Math.round(
      ((this.previousPrice - this.price) / this.previousPrice) * 100
    );
  }

  // Determine dealType based on discount
  if (!this.dealType) {
    if (this.discountPercentage >= 20) {
      this.dealType = "FLASH_SALE";
    } else if (this.discountPercentage > 0) {
      this.dealType = "DISCOUNTED";
    }
  }

  next();
});

module.exports = mongoose.model("Product", productSchema);


