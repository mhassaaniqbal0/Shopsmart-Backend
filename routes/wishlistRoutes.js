const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlistController');
const { verifyToken } = require('../middleware/authMiddleware');

// 📢 Private Wishlist Routes (Protected)
router.get('/', verifyToken, wishlistController.getUserWishlists);
router.post('/', verifyToken, wishlistController.createWishlist);
router.delete('/:id', verifyToken, wishlistController.deleteWishlist);
router.post('/:wishlistId/products', verifyToken, wishlistController.addProductToWishlist);
router.delete('/:wishlistId/products/:productId', verifyToken, wishlistController.removeProductFromWishlist);

// 📢 Public Sharing Route
router.get('/shared/:token', wishlistController.getPublicWishlist);

module.exports = router;
