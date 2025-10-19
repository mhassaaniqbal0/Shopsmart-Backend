const express = require("express");
const router = express.Router();
const { verifyToken, verifyAdmin } = require("../middleware/authMiddleware");
const { 
  createTicket, 
  getAllTickets, 
  resolveTicket,
  getMyTickets // ✅ NEW
} = require("../controllers/supportController");

// User routes
router.post("/", verifyToken, createTicket);

// ✅ NEW - Get user's own tickets (MUST BE BEFORE /:id routes)
// router.get("/my-tickets", verifyToken, getMyTickets);

// Admin routes
router.get("/", verifyToken, verifyAdmin, getAllTickets);
router.put("/:id", verifyToken, verifyAdmin, resolveTicket);

module.exports = router;