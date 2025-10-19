const mongoose = require("mongoose");

const medicineSchema = new mongoose.Schema({
  title: { type: String, required: true },
  imageUrl: { type: String },
  usage: { type: String, required: true },
  sideEffect: [{ type: String }],
category:{ type: String, required: true },
tags: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("CommonMedicine", medicineSchema);