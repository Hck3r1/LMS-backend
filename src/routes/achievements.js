const express = require('express');
const { protect } = require('../middleware/auth');
const Achievement = require('../models/Achievement');
const Course = require('../models/Course');

const router = express.Router();

// List my achievements
router.get('/me', protect, async (req, res) => {
  try {
    const items = await Achievement.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: { achievements: items } });
  } catch (e) {
    console.error('List achievements error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Award completion badge if progress is 100
router.post('/award/:courseId', protect, async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    const enr = course.enrolledStudents.find(e => e.student.toString() === req.user._id.toString());
    if (!enr) return res.status(403).json({ success: false, message: 'Not enrolled' });
    if ((enr.progress || 0) < 100) return res.status(400).json({ success: false, message: 'Course not yet completed' });
    const title = `Completed: ${course.title}`;
    const ach = await Achievement.findOneAndUpdate({ userId: req.user._id, courseId: course._id, type: 'course_complete' }, { $set: { title, description: 'Awarded for completing the course' } }, { upsert: true, new: true });
    res.json({ success: true, data: { achievement: ach } });
  } catch (e) {
    console.error('Award achievement error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;


