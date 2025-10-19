const Article = require("../models/article");

// ============================================
// Get all articles (with optional category)
// ============================================
exports.getArticles = async (req, res) => {
  try {
    const { category } = req.query;

    console.log("📝 [GET /articles] Query params:", { category });

    let filter = {};

    if (category && category.trim() !== "") {
      // Case-insensitive exact match
      filter.category = { $regex: `^${category}$`, $options: "i" };
      console.log("🔍 Filtering by category:", category);
    } else {
      console.log("📋 No category filter, returning all articles");
    }

    const articles = await Article.find(filter).sort({ createdAt: -1 });

    console.log(`✅ Found ${articles.length} articles`);
    res.json(articles);
  } catch (err) {
    console.error("❌ Get articles error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ============================================
// Get single article by ID
// ============================================
exports.getArticleById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("📝 [GET /:id] Fetching article:", id);

    const article = await Article.findById(id);
    if (!article) {
      console.log("⚠️ Article not found:", id);
      return res.status(404).json({ message: "Article not found", success: false });
    }

    console.log("✅ Article found");
    res.json(article);
  } catch (err) {
    console.error("❌ Get article by ID error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ============================================
// Search articles by title
// ============================================
exports.searchArticlesByTitle = async (req, res) => {
  try {
    const { Title } = req.query;
    console.log("🔎 [GET /search] Title parameter:", Title);

    if (!Title || Title.trim() === "") {
      return res.status(400).json({
        error: "Title query parameter is required",
        success: false,
      });
    }

    const articles = await Article.find({
      title: { $regex: Title, $options: "i" },
    }).sort({ createdAt: -1 });

    console.log(`✅ Found ${articles.length} matching articles`);
    res.json(articles);
  } catch (err) {
    console.error("❌ Search error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ============================================
// Create article (Admin only)
// ============================================
exports.createArticle = async (req, res) => {
  try {
    const { Title, ImageURL, Category, ShortDescription, Content, SourceLink } = req.body;

    console.log("📝 [POST] Creating article:", { Title, Category });

    if (!Title || !Category || !ShortDescription || !Content) {
      return res.status(400).json({
        error: "Title, Category, ShortDescription, and Content are required",
        success: false,
      });
    }

    const article = new Article({
      title: Title,
      category: Category,
      shortDescription: ShortDescription,
      content: Content,
      imageUrl: ImageURL,
      sourceLink: SourceLink,
      createdBy: req.user._id,
    });

    await article.save();
    console.log("✅ Article created:", article._id);

    res.status(201).json({
      message: "Article created successfully",
      success: true,
      article,
    });
  } catch (err) {
    console.error("❌ Create article error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ============================================
// ✅ FIXED: Update article (Admin only)
// ============================================
exports.updateArticle = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("📝 [PUT /:id] Updating article:", id);
    console.log("📦 Request body:", req.body);

    // Handle both uppercase & lowercase keys from frontend
    const title = req.body.title || req.body.Title;
    const category = req.body.category || req.body.Category;
    const shortDescription = req.body.shortDescription || req.body.ShortDescription;
    const content = req.body.content || req.body.Content;
    const imageUrl = req.body.imageUrl || req.body.ImageURL;
    const sourceLink = req.body.sourceLink || req.body.SourceLink;

    if (!title || !category || !shortDescription || !content) {
      return res.status(400).json({
        error: "Title, Category, ShortDescription, and Content are required",
        success: false,
      });
    }

    const updateFields = {
      title,
      category,
      shortDescription,
      content,
      imageUrl,
      sourceLink,
      updatedAt: new Date(),
    };

    const updated = await Article.findByIdAndUpdate(id, updateFields, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      console.log("⚠️ Article not found for update:", id);
      return res.status(404).json({ error: "Article not found", success: false });
    }

    console.log("✅ Article updated:", updated._id);
    res.json({
      message: "Article updated successfully",
      success: true,
      article: updated,
    });
  } catch (err) {
    console.error("❌ Update article error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ============================================
// Delete article (Admin only)
// ============================================
exports.deleteArticle = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("📝 [DELETE /:id] Deleting article:", id);

    const deleted = await Article.findByIdAndDelete(id);

    if (!deleted) {
      console.log("⚠️ Article not found for deletion:", id);
      return res.status(404).json({ error: "Article not found", success: false });
    }

    console.log("✅ Article deleted:", deleted._id);
    res.json({ message: "Article deleted successfully", success: true, article: deleted });
  } catch (err) {
    console.error("❌ Delete article error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
