const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  medicineName: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  reviewTitle: { type: String, required: true },
  reviewText: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Review", reviewSchema);