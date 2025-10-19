const express = require("express");
const router = express.Router();
const { verifyToken, verifyAdmin } = require("../middleware/authMiddleware");
const { 
  createReview, 
  deleteReview, 
  editReview, 
  getAllReviews, 
  getReviewsByMedicineName,
  getMyReviews // ✅ NEW
} = require("../controllers/reviewContoller"); // Note: single 'l' to match your filename

// Create review (user)
router.post("/", verifyToken, createReview);

// ✅ NEW - Get user's own reviews (MUST BE BEFORE /:id routes)
router.get("/my-reviews", verifyToken, getMyReviews);

// Get reviews by medicine name (user search)
router.get("/search", verifyToken, getReviewsByMedicineName);

// Get all reviews (admin)
router.get("/", getAllReviews); // public route for community reviews

// Edit review (admin only)
router.put("/:id", verifyToken, verifyAdmin, editReview);

// Delete review (admin only)
router.delete("/:id", verifyToken, verifyAdmin, deleteReview);

module.exports = router;