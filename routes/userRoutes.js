const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { verifyToken } = require('../middleware/authMiddleware');

// Protected routes - require authentication
router.use(verifyToken);

// POST /purchase
// Logic: Increment purchaseCount, add loyaltyPoints, add coins every 3rd purchase
router.post('/purchase', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.purchaseCount = (user.purchaseCount || 0) + 1;
    user.loyaltyPoints = (user.loyaltyPoints || 0) + 10;

    // Every 3rd purchase, reward 500 coins
    if (user.purchaseCount % 3 === 0) {
      user.coins = (user.coins || 0) + 500;
    }

    await user.save();
    res.json(user);
  } catch (error) {
    console.error('Purchase error:', error);
    res.status(500).json({ message: 'Server error processing purchase' });
  }
});

// POST /promote
// Logic: Deduct coins to promote a product
router.post('/promote', async (req, res) => {
  const { productId, cost } = req.body;
  const promotionCost = cost || 100; // Default to 100 if not provided

  if (!productId) {
    return res.status(400).json({ message: 'Product ID is required' });
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user has enough coins
    if ((user.coins || 0) < promotionCost) {
      return res.status(400).json({ message: 'Insufficient coins' });
    }

    // Check if already promoted
    if (user.promotedProducts.includes(productId)) {
      return res.status(400).json({ message: 'Product already promoted' });
    }

    // Deduct coins and add to promoted products
    user.coins -= promotionCost;
    user.promotedProducts.push(productId);

    await user.save();
    res.json(user);
  } catch (error) {
    console.error('Promote error:', error);
    res.status(500).json({ message: 'Server error processing promotion' });
  }
});

module.exports = router;
