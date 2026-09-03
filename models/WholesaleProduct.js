const mongoose = require("mongoose");

const tierPriceSchema = new mongoose.Schema(
  {
    minQty: { type: Number, required: true, min: 1 },
    maxQty: { type: Number, default: null, min: 1 },
    priceMin: { type: Number, default: null, min: 0 },
    priceMax: { type: Number, default: null, min: 0 },
    priceText: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const wholesaleProductSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      required: true,
      enum: ["Alibaba", "Daraz", "Telemart", "MadeInChina"],
      trim: true,
    },
    sourceQuery: { type: String, default: "", trim: true },
    productName: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true },
    productUrl: { type: String, required: true, trim: true },
    image: { type: String, default: "", trim: true },

    currency: { type: String, default: "", trim: true },
    priceMin: { type: Number, default: null, min: 0 },
    priceMax: { type: Number, default: null, min: 0 },
    priceText: { type: String, default: "", trim: true },

    moq: { type: Number, default: null, min: 1 },
    moqUnit: { type: String, default: "", trim: true },
    tierPrices: { type: [tierPriceSchema], default: [] },

    sellerName: { type: String, default: "", trim: true },
    sellerUrl: { type: String, default: "", trim: true },
    sellerVerified: { type: Boolean, default: false },

    rating: { type: Number, default: null, min: 0, max: 5 },
    reviewsCount: { type: Number, default: null, min: 0 },

    deliveryText: { type: String, default: "", trim: true },
    deliveryMinDays: { type: Number, default: null, min: 0 },
    deliveryMaxDays: { type: Number, default: null, min: 0 },

    inStock: { type: Boolean, default: null },
    stockText: { type: String, default: "", trim: true },

    reliabilityScore: { type: Number, default: 0, min: 0, max: 100 },

    lastScrapedAt: { type: Date, default: null },
    raw: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

wholesaleProductSchema.index({ platform: 1, productUrl: 1 }, { unique: true });
wholesaleProductSchema.index({ normalizedName: 1, platform: 1 });
wholesaleProductSchema.index({ sourceQuery: 1, platform: 1 });
wholesaleProductSchema.index({ reliabilityScore: -1 });

function computeReliabilityScore(doc) {
  let score = 0;

  if (typeof doc.rating === "number") {
    score += Math.max(0, Math.min(5, doc.rating)) / 5 * 50;
  }

  if (typeof doc.reviewsCount === "number") {
    const r = Math.max(0, doc.reviewsCount);
    const normalized = Math.min(1, Math.log10(r + 1) / 3);
    score += normalized * 30;
  }

  if (doc.sellerVerified) score += 10;

  if (doc.inStock === true) score += 5;

  if (typeof doc.deliveryMinDays === "number") {
    if (doc.deliveryMinDays <= 7) score += 5;
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}

wholesaleProductSchema.pre("save", function (next) {
  this.reliabilityScore = computeReliabilityScore(this);
  next();
});

module.exports = mongoose.model("WholesaleProduct", wholesaleProductSchema);

