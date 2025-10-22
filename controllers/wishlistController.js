// backend/controllers/wishlistController.js
const Wishlist = require('../models/Wishlist');
const { nanoid } = require('nanoid');
const mongoose = require('mongoose');

function ensureObjectId(id) {
  if (mongoose.Types.ObjectId.isValid(id)) return mongoose.Types.ObjectId(id);
  throw new Error('Invalid id');
}

exports.createWishlist = async (req, res) => {
  try {
    const userId = req.user._id;
    const { title, description } = req.body;
    const w = await Wishlist.create({ owner: userId, title, description });
    return res.status(201).json(w);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.listWishlists = async (req, res) => {
  try {
    const userId = req.user._id;
    const wishlists = await Wishlist.find({ owner: userId }).sort({ updatedAt: -1 });
    return res.json(wishlists);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getWishlist = async (req, res) => {
  try {
    const id = req.params.id;
    const token = req.query.token;
    const wishlist = await Wishlist.findById(id);
    if (!wishlist) return res.status(404).json({ message: 'Wishlist not found' });
    if (wishlist.owner.toString() === req.user._id.toString() || (token && wishlist.sharedToken === token)) {
      return res.json(wishlist);
    }
    return res.status(403).json({ message: 'Forbidden' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateWishlist = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user._id;
    const allowed = {};
    if (req.body.title !== undefined) allowed.title = req.body.title;
    if (req.body.description !== undefined) allowed.description = req.body.description;
    if (req.body.isPublic !== undefined) allowed.isPublic = req.body.isPublic;
    const wishlist = await Wishlist.findOneAndUpdate({ _id: id, owner: userId }, { $set: allowed }, { new: true });
    if (!wishlist) return res.status(404).json({ message: 'Not found or not owner' });
    return res.json(wishlist);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteWishlist = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user._id;
    const r = await Wishlist.findOneAndDelete({ _id: id, owner: userId });
    if (!r) return res.status(404).json({ message: 'Not found or not owner' });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.addItem = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user._id;
    const { productId, platform, targetPrice, notes, lastKnownPrice } = req.body;
    if (!productId) return res.status(400).json({ message: 'productId required' });
    const wishlist = await Wishlist.findOne({ _id: id, owner: userId });
    if (!wishlist) return res.status(404).json({ message: 'Wishlist not found' });
    const exists = wishlist.items.find(i => i.productId === productId && i.platform === platform);
    if (exists) return res.status(409).json({ message: 'Item already in wishlist' });
    wishlist.items.push({ productId, platform, targetPrice, notes, lastKnownPrice });
    await wishlist.save();
    return res.status(201).json(wishlist);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.removeItem = async (req, res) => {
  try {
    const id = req.params.id;
    const itemId = req.params.itemId;
    const userId = req.user._id;
    const wishlist = await Wishlist.findOne({ _id: id, owner: userId });
    if (!wishlist) return res.status(404).json({ message: 'Wishlist not found' });
    wishlist.items = wishlist.items.filter(i => i._id.toString() !== itemId);
    await wishlist.save();
    return res.json(wishlist);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.generateShare = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user._id;
    const wishlist = await Wishlist.findOne({ _id: id, owner: userId });
    if (!wishlist) return res.status(404).json({ message: 'Wishlist not found' });
    wishlist.isPublic = true;
    wishlist.sharedToken = nanoid(12);
    await wishlist.save();
    return res.json({ sharedToken: wishlist.sharedToken });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.revokeShare = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user._id;
    const wishlist = await Wishlist.findOne({ _id: id, owner: userId });
    if (!wishlist) return res.status(404).json({ message: 'Wishlist not found' });
    wishlist.isPublic = false;
    wishlist.sharedToken = undefined;
    await wishlist.save();
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
};
