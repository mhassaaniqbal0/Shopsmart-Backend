// backend/routes/wishlistRoutes.js
const express = require('express');
const ctrl = require('../controllers/wishlistController');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/', auth, ctrl.createWishlist);
router.get('/', auth, ctrl.listWishlists);
router.get('/:id', auth, ctrl.getWishlist); // token query allowed
router.patch('/:id', auth, ctrl.updateWishlist);
router.delete('/:id', auth, ctrl.deleteWishlist);
router.post('/wishlist/add', auth, ctrl.addItem);
router.delete('/:id/items/:itemId', auth, ctrl.removeItem);
router.post('/:id/share', auth, ctrl.generateShare);
router.post('/:id/revoke', auth, ctrl.revokeShare);

module.exports = router;
