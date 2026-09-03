const mongoose = require("mongoose");

const productListingSnapshotSchema = new mongoose.Schema(
  {
    masterProductId: { type: mongoose.Schema.Types.ObjectId, ref: "MasterProduct", required: true, index: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: "ProductListing", required: true, index: true },
    platform: { type: String, required: true, enum: ["Daraz", "Telemart", "Alibaba", "Temu", "OLX"], trim: true, index: true },
    capturedAt: { type: Date, required: true, index: true },

    currency: { type: String, default: "", trim: true },
    priceMin: { type: Number, default: null, min: 0 },
    priceMax: { type: Number, default: null, min: 0 },
    priceText: { type: String, default: "", trim: true },

    rating: { type: Number, default: null, min: 0, max: 5 },
    reviewsCount: { type: Number, default: null, min: 0 },
    sellerRating: { type: Number, default: null, min: 0, max: 5 },

    deliveryMinDays: { type: Number, default: null, min: 0 },
    deliveryMaxDays: { type: Number, default: null, min: 0 },
    availability: { type: String, default: "", trim: true },

    raw: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

productListingSnapshotSchema.index({ listingId: 1, capturedAt: -1 });

module.exports = mongoose.model("ProductListingSnapshot", productListingSnapshotSchema);
