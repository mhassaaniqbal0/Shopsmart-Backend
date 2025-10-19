const express = require("express");
const router = express.Router();
const { verifyToken, verifyAdmin } = require("../middleware/authMiddleware");
const { getAllUsers, deleteUser,updateUser,searchUser } = require("../controllers/adminController");

router.get("/users", verifyToken, verifyAdmin, getAllUsers);
router.delete("/users/:id", verifyToken, verifyAdmin, deleteUser);
router.put("/users/:id", verifyToken, verifyAdmin, updateUser);
router.get("/users/search", verifyToken, verifyAdmin, searchUser);//for searching users by username or ema

module.exports = router;
