const express = require('express');
const { body, validationResult } = require('express-validator');
const Message = require('../models/Message');
const { protect } = require('../middleware/auth');

const router = express.Router();

// List conversations (distinct users this user has messages with)
router.get('/conversations', protect, async (req, res) => {
  try {
    const convos = await Message.aggregate([
      { $match: { $or: [{ from: req.user._id }, { to: req.user._id }] } },
      { $project: { other: { $cond: [{ $eq: ['$from', req.user._id] }, '$to', '$from'] }, createdAt: 1 } },
      { $group: { _id: '$other', last: { $max: '$createdAt' } } },
      { $sort: { last: -1 } }
    ]);
    res.json({ success: true, data: { conversations: convos } });
  } catch (e) {
    console.error('List conversations error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// List messages with a user
router.get('/with/:userId', protect, async (req, res) => {
  try {
    const msgs = await Message.find({
      $or: [
        { from: req.user._id, to: req.params.userId },
        { from: req.params.userId, to: req.user._id }
      ]
    }).sort({ createdAt: 1 });
    res.json({ success: true, data: { messages: msgs } });
  } catch (e) {
    console.error('List messages error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Send message
router.post('/', [protect, body('to').isMongoId(), body('content').isLength({ min: 1, max: 5000 })], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    const msg = await Message.create({ from: req.user._id, to: req.body.to, content: req.body.content });
    res.status(201).json({ success: true, data: { message: msg } });
  } catch (e) {
    console.error('Send message error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;


