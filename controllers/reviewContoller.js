const Review = require("../models/review");

// Create review (user)
exports.createReview = async (req, res) => {
  try {
    const { medicineName, rating, reviewTitle, reviewText } = req.body;
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }
    const review = new Review({
      medicineName,
      rating,
      reviewTitle,
      reviewText,
      user: req.user._id
    });
    await review.save();
    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ NEW - Get user's own reviews only
exports.getMyReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ user: req.user._id })
      .populate("user", "firstName lastName email")
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Edit review (admin only)
exports.editReview = async (req, res) => {
  try {
    const { rating, reviewText } = req.body;
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }
    const updatedReview = await Review.findByIdAndUpdate(
      req.params.id,
      { $set: { rating, reviewText } },
      { new: true, runValidators: true }
    );
    if (!updatedReview) {
      return res.status(404).json({ error: "Review not found" });
    }
    res.json(updatedReview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete review (admin only)
exports.deleteReview = async (req, res) => {
  try {
    await Review.findByIdAndDelete(req.params.id);
    res.json({ message: "Review deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all reviews (admin)
exports.getAllReviews = async (req, res) => {
  try {
    const reviews = await Review.find().populate("user", "firstName lastName email");
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get reviews by medicine name (user search)
exports.getReviewsByMedicineName = async (req, res) => {
  try {
    const { medicineName } = req.query;
    if (!medicineName) {
      return res.status(400).json({ error: "medicineName query parameter is required" });
    }
    const reviews = await Review.find({ medicineName: { $regex: medicineName, $options: "i" } })
      .populate("user", "firstName lastName email");
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};