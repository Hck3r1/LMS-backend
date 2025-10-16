const express = require('express');
const { body, param, validationResult } = require('express-validator');
const ForumThread = require('../models/ForumThread');
const Course = require('../models/Course');
const { protect } = require('../middleware/auth');

const router = express.Router();

// List threads by course
router.get('/course/:courseId', protect, async (req, res) => {
  try {
    const threads = await ForumThread.find({ courseId: req.params.courseId }).sort({ updatedAt: -1 }).select('title author updatedAt createdAt');
    res.json({ success: true, data: { threads } });
  } catch (e) {
    console.error('List threads error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create thread
router.post('/', [protect, body('courseId').isMongoId(), body('title').isLength({ min: 3, max: 200 })], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    const course = await Course.findById(req.body.courseId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    // Allow enrolled students or the instructor to create threads
    const isInstructor = course.instructor.toString() === req.user._id.toString();
    const isEnrolled = course.enrolledStudents.some(e => e.student.toString() === req.user._id.toString());
    if (!isInstructor && !isEnrolled && req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Not authorized' });
    const thread = await ForumThread.create({ courseId: req.body.courseId, title: req.body.title, author: req.user._id, posts: [] });
    res.status(201).json({ success: true, data: { thread } });
  } catch (e) {
    console.error('Create thread error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get thread
router.get('/:id', protect, async (req, res) => {
  try {
    const thread = await ForumThread.findById(req.params.id).populate('author', 'firstName lastName').populate('posts.author', 'firstName lastName');
    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });
    res.json({ success: true, data: { thread } });
  } catch (e) {
    console.error('Get thread error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Reply to thread
router.post('/:id/reply', [protect, param('id').isMongoId(), body('content').isLength({ min: 1, max: 5000 })], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    const thread = await ForumThread.findById(req.params.id);
    if (!thread) return res.status(404).json({ success: false, message: 'Thread not found' });
    thread.posts.push({ author: req.user._id, content: req.body.content });
    await thread.save();
    res.json({ success: true, data: { thread } });
  } catch (e) {
    console.error('Reply error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;


