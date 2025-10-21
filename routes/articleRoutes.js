const express = require("express");
const router = express.Router();
const { verifyToken, verifyAdmin } = require("../middleware/authMiddleware");
const {
  createArticle,
  getArticles,
  getArticleById,
  updateArticle,
  deleteArticle,
  searchArticlesByTitle,
} = require("../controllers/articleController");

console.log("📝 Article routes loading...");

// ============================================
// PUBLIC ROUTES
// ============================================

// Get all articles
router.get("/", getArticles);

// Get articles by category
router.get("/category/:category", async (req, res) => {
  const { category } = req.params;
  const Article = require("../models/article");

  try {
    const articles = await Article.find({ category })
      .sort({ createdAt: -1 })
      .exec();

    res.json(articles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

// Search articles by title
router.get("/search", verifyToken, verifyAdmin, searchArticlesByTitle);

// Get single article by ID
router.get("/:id", getArticleById);

// Create article (Admin only)
router.post("/", verifyToken, verifyAdmin, createArticle);

// Update article (Admin only)
router.put("/:id", verifyToken, verifyAdmin, updateArticle);

// Delete article (Admin only)
router.delete("/:id", verifyToken, verifyAdmin, deleteArticle);

console.log("✅ Article routes loaded successfully");
module.exports = router;