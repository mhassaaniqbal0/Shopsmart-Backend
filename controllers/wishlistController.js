const Wishlist = require('../models/Wishlist');
const crypto = require('crypto');

// 🧾 Get All Wishlists for Logged-in User
exports.getUserWishlists = async (req, res) => {
  try {
    const wishlists = await Wishlist.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(wishlists);
  } catch (error) {
    console.error('Error fetching wishlists:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 🧾 Create a New Wishlist
exports.createWishlist = async (req, res) => {
  try {
    const { name, description, isPublic } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Wishlist name is required' });
    }

    const newWishlist = new Wishlist({
      user: req.user._id,
      name,
      description,
      isPublic: isPublic || false,
      shareToken: isPublic ? crypto.randomBytes(16).toString('hex') : null,
      products: []
    });

    await newWishlist.save();
    res.status(201).json(newWishlist);
  } catch (error) {
    console.error('Error creating wishlist:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 🧾 Add Product to Wishlist
exports.addProductToWishlist = async (req, res) => {
  try {
    const { wishlistId } = req.params;
    const { productId, productName, price, image, platform } = req.body;

    const wishlist = await Wishlist.findOne({ _id: wishlistId, user: req.user._id });
    if (!wishlist) {
      return res.status(404).json({ message: 'Wishlist not found' });
    }

    // Check if product already exists in this wishlist
    const exists = wishlist.products.find(p => p.productId === productId);
    if (exists) {
      return res.status(400).json({ message: 'Product already in wishlist' });
    }

    wishlist.products.push({
      productId,
      productName,
      price,
      image,
      platform
    });

    await wishlist.save();
    res.json(wishlist);
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 🧾 Remove Product from Wishlist
exports.removeProductFromWishlist = async (req, res) => {
  try {
    const { wishlistId, productId } = req.params;

    const wishlist = await Wishlist.findOne({ _id: wishlistId, user: req.user._id });
    if (!wishlist) {
      return res.status(404).json({ message: 'Wishlist not found' });
    }

    wishlist.products = wishlist.products.filter(p => p.productId !== productId);
    await wishlist.save();
    res.json(wishlist);
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 🧾 Delete a Wishlist
exports.deleteWishlist = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Wishlist.findOneAndDelete({ _id: id, user: req.user._id });
    if (!deleted) {
      return res.status(404).json({ message: 'Wishlist not found' });
    }
    res.json({ message: 'Wishlist deleted successfully' });
  } catch (error) {
    console.error('Error deleting wishlist:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 🧾 Get Public Wishlist by Share Token
exports.getPublicWishlist = async (req, res) => {
  try {
    const { token } = req.params;
    const wishlist = await Wishlist.findOne({ shareToken: token, isPublic: true }).populate('user', 'firstName lastName');
    if (!wishlist) {
      return res.status(404).json({ message: 'Public wishlist not found or is no longer shared' });
    }
    res.json(wishlist);
  } catch (error) {
    console.error('Error fetching public wishlist:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
