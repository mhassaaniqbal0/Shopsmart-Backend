const mongoose = require("mongoose");

const supportSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  subject: { type: String, required: true },
  description: { type: String, required: true },
  status: { type: String, enum: ["open", "resolved"], default: "open" },
  Priority: { type: String, enum: ["Low", "Medium", "High"] },
  createdAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
});

module.exports = mongoose.model("SupportTicket", supportSchema);