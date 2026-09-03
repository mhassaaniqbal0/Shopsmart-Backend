const mongoose = require("mongoose");

const masterProductSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    normalizedTitle: { type: String, required: true, trim: true, index: true },
    category: { type: String, default: "general", trim: true, index: true },

    brand: { type: String, default: "", trim: true, index: true },
    model: { type: String, default: "", trim: true, index: true },
    specs: { type: mongoose.Schema.Types.Mixed, default: null },

    keywords: { type: [String], default: [], index: true },
    images: { type: [String], default: [] },
    lastAggregatedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

masterProductSchema.index({ brand: 1, model: 1, category: 1 });

module.exports = mongoose.model("MasterProduct", masterProductSchema);
