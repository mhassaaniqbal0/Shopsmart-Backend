// routes/medicineRoutes.js
const express = require("express");
const router = express.Router();
const { verifyToken, verifyAdmin } = require("../middleware/authMiddleware");
const { 
  addMedicine, 
  updateMedicine, 
  deleteMedicine, 
  getAllMedicine, 
  getMedicinesByCategory 
} = require("../controllers/CommonmedicineController");

// CRITICAL: Specific routes MUST come before parameterized routes
// Public route - no auth needed
router.get("/common", getMedicinesByCategory);

// Admin routes
router.post("/", verifyToken, verifyAdmin, addMedicine);
router.put("/:id", verifyToken, verifyAdmin, updateMedicine);
router.delete("/:id", verifyToken, verifyAdmin, deleteMedicine);

// Auth required route
router.get("/", verifyToken, getAllMedicine);

module.exports = router;