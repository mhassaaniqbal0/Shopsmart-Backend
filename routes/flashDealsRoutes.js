const express = require("express");
const router = express.Router();
const { getFlashDeals } = require("../controllers/flashDealsController");

/**
 * @route  GET /api/flash-deals
 * @desc   Get flash deals, best value deals, limited time offers, and personalized deals
 * @access Public
 *
 * Query Parameters:
 * - userId (optional): User ID for personalized recommendations
 * - limit (optional): Number of results per category (default: 20)
 * - platform (optional): Filter by "Daraz" or "Telemart"
 *
 * Example:
 * GET /api/flash-deals
 * GET /api/flash-deals?userId=123&limit=10&platform=Daraz
 */
router.get("/", getFlashDeals);

module.exports = router;


