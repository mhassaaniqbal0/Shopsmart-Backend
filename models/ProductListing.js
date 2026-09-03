const mongoose = require("mongoose");

const productListingSchema = new mongoose.Schema(
  {
    masterProductId: { type: mongoose.Schema.Types.ObjectId, ref: "MasterProduct", index: true, default: null },

    platform: { type: String, required: true, enum: ["Daraz", "Telemart", "Alibaba", "Temu", "OLX"], trim: true, index: true },
    sourceQuery: { type: String, default: "", trim: true, index: true },

    title: { type: String, required: true, trim: true },
    normalizedTitle: { type: String, required: true, trim: true, index: true },
    listingUrl: { type: String, required: true, trim: true },
    image: { type: String, default: "", trim: true },

    currency: { type: String, default: "", trim: true },
    priceMin: { type: Number, default: null, min: 0 },
    priceMax: { type: Number, default: null, min: 0 },
    priceText: { type: String, default: "", trim: true },

    rating: { type: Number, default: null, min: 0, max: 5 },
    reviewsCount: { type: Number, default: null, min: 0 },

    sellerName: { type: String, default: "", trim: true },
    sellerRating: { type: Number, default: null, min: 0, max: 5 },

    deliveryText: { type: String, default: "", trim: true },
    deliveryMinDays: { type: Number, default: null, min: 0 },
    deliveryMaxDays: { type: Number, default: null, min: 0 },

    availability: { type: String, default: "", trim: true },
    lastSeenAt: { type: Date, default: null, index: true },

    raw: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

productListingSchema.index({ platform: 1, listingUrl: 1 }, { unique: true });

module.exports = mongoose.model("ProductListing", productListingSchema);
