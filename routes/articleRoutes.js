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
// ✅ NEW FIX: Query-based category filter (for homepage & user dashboard)
// ============================================
router.get("/", async (req, res) => {
  const { category } = req.query;
  const Article = require("../models/article");

  try {
    let filter = {};

    if (category && category.trim() !== "") {
      filter = {
        $or: [
          { category: { $regex: `^${category}$`, $options: "i" } },
          { Category: { $regex: `^${category}$`, $options: "i" } },
        ],
      };
      console.log("🔍 Filtering by category:", category);
    } else {
      console.log("📋 No category filter, returning all");
    }

    // ✅ For homepage limit top 3, else return all for full view
    const limitCount = category ? 3 : 0;
    const query = Article.find(filter).sort({ createdAt: -1 });
    if (limitCount > 0) query.limit(limitCount);

    const articles = await query.exec();
    console.log(`✅ Found ${articles.length} articles`);
    res.json(articles);
  } catch (err) {
    console.error("❌ Error fetching articles:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Category-based route (optional, still kept for flexibility)
// ============================================
router.get("/category/:category", async (req, res) => {
  const { category } = req.params;
  const Article = require("../models/article");

  try {
    const articles = await Article.find({
      $or: [
        { category: { $regex: `^${category}$`, $options: "i" } },
        { Category: { $regex: `^${category}$`, $options: "i" } },
      ],
    })
      .sort({ createdAt: -1 })
      .exec();

    console.log(`✅ Found ${articles.length} articles for category ${category}`);
    res.json(articles);
  } catch (err) {
    console.error("❌ Category fetch error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN ROUTES (protected)
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
