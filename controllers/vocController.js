const VocComment = require('../models/VocComment');

// 🧾 Get All Comments
exports.getComments = async (req, res) => {
  try {
    const comments = await VocComment.find()
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.json(comments);
  } catch (error) {
    console.error('Error fetching VOC comments:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 🧾 Create a Comment
exports.createComment = async (req, res) => {
  try {
    const { text, userName } = req.body;
    
    if (!text) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const newComment = new VocComment({
      user: req.user ? req.user._id : null,
      userName: userName || (req.user ? `${req.user.firstName} ${req.user.lastName}`.trim() : 'Guest User'),
      text,
      media: req.files ? req.files.map(file => ({
        type: file.mimetype.startsWith('video') ? 'video' : 'image',
        url: `/uploads/${file.filename}` 
      })) : []
    });

    await newComment.save();
    res.status(201).json(newComment);
  } catch (error) {
    console.error('Error creating VOC comment:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 🧾 Add a Reply
exports.addReply = async (req, res) => {
  try {
    const { id } = req.params;
    const { text, userName } = req.body;

    if (!text) {
      return res.status(400).json({ message: 'Reply text is required' });
    }

    const comment = await VocComment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: `Comment with ID ${id} not found in database` });
    }

    const reply = {
      user: req.user ? req.user._id : null,
      userName: userName || (req.user ? `${req.user.firstName} ${req.user.lastName}`.trim() : 'Guest User'),
      text,
      createdAt: new Date()
    };

    comment.replies.push(reply);
    await comment.save();

    res.status(201).json(comment);
  } catch (error) {
    console.error('Error adding reply:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 🧾 Share a Comment
exports.shareComment = async (req, res) => {
  try {
    const { id } = req.params;
    const comment = await VocComment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    comment.shareCount = (comment.shareCount || 0) + 1;
    await comment.save();

    res.json({ shareCount: comment.shareCount });
  } catch (error) {
    console.error('Error sharing comment:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 🧾 Toggle Like on a Comment
exports.toggleLike = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user._id : null;

    if (!userId) {
      return res.status(401).json({ message: 'Login required to like comments' });
    }

    const comment = await VocComment.findById(id);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    const likedIndex = comment.likedBy.indexOf(userId);
    if (likedIndex === -1) {
      // Like
      comment.likedBy.push(userId);
      comment.likes += 1;
    } else {
      // Unlike
      comment.likedBy.splice(likedIndex, 1);
      comment.likes -= 1;
    }

    await comment.save();
    res.json({ likes: comment.likes, hasLiked: likedIndex === -1 });
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
