const express = require('express');
const { body, validationResult, param } = require('express-validator');
const Quiz = require('../models/Quiz');
const Course = require('../models/Course');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Create quiz (tutor)
router.post('/', [
  protect,
  authorize('tutor', 'admin'),
  body('courseId').isMongoId(),
  body('moduleId').isMongoId(),
  body('title').isLength({ min: 3, max: 200 }),
  body('questions').isArray({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });

    const course = await Course.findById(req.body.courseId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const quiz = await Quiz.create(req.body);
    res.status(201).json({ success: true, data: { quiz } });
  } catch (e) {
    console.error('Create quiz error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get quizzes for a module (student/tutor)
router.get('/module/:moduleId', protect, async (req, res) => {
  try {
    const quizzes = await Quiz.find({ moduleId: req.params.moduleId, isPublished: true });
    res.json({ success: true, data: { quizzes } });
  } catch (e) {
    console.error('List quizzes error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Take quiz (student) - grade immediately
router.post('/:id/attempt', [protect, authorize('student', 'admin'), param('id').isMongoId()], async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz || !quiz.isPublished) return res.status(404).json({ success: false, message: 'Quiz not found' });
    const result = quiz.grade(req.body.answers || []);
    // No persistence of attempts for brevity (can be added later)
    res.json({ success: true, data: { result } });
  } catch (e) {
    console.error('Attempt quiz error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Publish/unpublish (tutor)
router.put('/:id/publish', [protect, authorize('tutor', 'admin'), param('id').isMongoId(), body('isPublished').isBoolean()], async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found' });
    const course = await Course.findById(quiz.courseId);
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    quiz.isPublished = req.body.isPublished;
    await quiz.save();
    res.json({ success: true, data: { quiz } });
  } catch (e) {
    console.error('Publish quiz error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;


