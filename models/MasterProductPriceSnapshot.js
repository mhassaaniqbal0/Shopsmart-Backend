const mongoose = require("mongoose");

const masterProductPriceSnapshotSchema = new mongoose.Schema(
  {
    masterProductId: { type: mongoose.Schema.Types.ObjectId, ref: "MasterProduct", required: true, index: true },
    capturedAt: { type: Date, required: true, index: true },
    currency: { type: String, default: "", trim: true },
    priceMin: { type: Number, default: null, min: 0 },
    priceMax: { type: Number, default: null, min: 0 },
    source: { type: String, required: true, enum: ["synthetic", "scraped"], trim: true, index: true },
  },
  { timestamps: true }
);

masterProductPriceSnapshotSchema.index({ masterProductId: 1, capturedAt: 1, source: 1 }, { unique: true });

module.exports = mongoose.model("MasterProductPriceSnapshot", masterProductPriceSnapshotSchema);
