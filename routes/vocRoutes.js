const express = require('express');
const router = express.Router();
const { getComments, createComment, toggleLike, addReply, shareComment } = require('../controllers/vocController');
const { verifyToken } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// 📢 Community Discussions Routes
router.get('/', getComments);
router.post('/', verifyToken, upload.array('media'), createComment); 
router.post('/:id/like', verifyToken, toggleLike); 
router.post('/:id/reply', verifyToken, addReply);
router.post('/:id/share', shareComment); 

module.exports = router;
