const express = require("express");
const router = express.Router();

const { verifyToken, verifyAdmin } = require("../middleware/authMiddleware");
const {
  listWholesaleProducts,
  getWholesaleInsights,
  triggerWholesaleScrape,
} = require("../controllers/wholesaleController");

router.get("/products", listWholesaleProducts);
router.get("/insights", getWholesaleInsights);
router.post("/scrape", verifyToken, verifyAdmin, triggerWholesaleScrape);

module.exports = router;

