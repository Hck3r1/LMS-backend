const express = require('express');
const { body, validationResult } = require('express-validator');
const Review = require('../models/Review');
const Course = require('../models/Course');
const { protect } = require('../middleware/auth');

const router = express.Router();

// List reviews for a course
router.get('/course/:courseId', async (req, res) => {
  try {
    const reviews = await Review.find({ courseId: req.params.courseId }).sort({ createdAt: -1 }).populate('author', 'firstName lastName');
    res.json({ success: true, data: { reviews } });
  } catch (e) {
    console.error('List reviews error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create or update review (upsert per author)
router.post('/', [protect, body('courseId').isMongoId(), body('rating').isInt({ min: 1, max: 5 }), body('comment').optional().isLength({ max: 2000 })], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    const { courseId, rating, comment } = req.body;
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const existing = await Review.findOneAndUpdate({ courseId, author: req.user._id }, { $set: { rating, comment } }, { upsert: true, new: true, setDefaultsOnInsert: true });

    // Recompute course rating breakdown
    const agg = await Review.aggregate([
      { $match: { courseId: course._id } },
      { $group: { _id: '$rating', count: { $sum: 1 } } }
    ]);
    const breakdown = { one: 0, two: 0, three: 0, four: 0, five: 0 };
    let total = 0; let sum = 0;
    for (const a of agg) {
      const k = ['zero','one','two','three','four','five'][a._id];
      if (k && breakdown[k] !== undefined) {
        breakdown[k] = a.count;
        total += a.count;
        sum += a._id * a.count;
      }
    }
    course.rating = { average: total ? Math.round((sum / total) * 10) / 10 : 0, count: total, breakdown };
    await course.save();

    res.status(201).json({ success: true, data: { review: existing } });
  } catch (e) {
    console.error('Create review error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;


