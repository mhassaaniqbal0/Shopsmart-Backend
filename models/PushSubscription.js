// backend/models/PushSubscription.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const PushSubSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  endpoint: { type: String, required: true },
  keys: {
    p256dh: { type: String },
    auth: { type: String }
  },
  browser: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PushSubscription', PushSubSchema);
