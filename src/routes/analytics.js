const express = require('express');
const User = require('../models/User');
const Course = require('../models/Course');
const Submission = require('../models/Submission');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();
/**
 * @swagger
 * /analytics/student/{studentId}/overview:
 *   get:
 *     summary: Student overview analytics (live stats)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Student overview stats
 */
router.get('/student/:studentId/overview', protect, authorize('student', 'admin'), async (req, res) => {
  try {
    const student = await User.findById(req.params.studentId).populate('enrolledCourses', 'modules');
    if (!student || (student.role !== 'student' && req.user.role !== 'admin')) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const enrolledCourses = Array.isArray(student.enrolledCourses) ? student.enrolledCourses : [];
    const totalCourses = enrolledCourses.length;

    // Compute modules counts (requires course.modules to be actual refs or lengths)
    const totalModules = enrolledCourses.reduce((sum, c) => sum + (Array.isArray(c.modules) ? c.modules.length : 0), 0);
    // Placeholder for completedModules and averageGrade (needs per-student progress & submissions schema)
    const completedModules = 0;
    const averageGrade = 0;
    const totalStudyTime = 0;

    res.json({ success: true, data: { totalCourses, totalModules, completedModules, averageGrade, totalStudyTime } });
  } catch (e) {
    console.error('Student overview error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Helpers
const parseTimeframe = (tf) => {
  const now = new Date();
  const map = { '7d': 7, '30d': 30, '90d': 90 };
  const days = map[tf] || 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
};

const getSpecializationCourses = async (specialization) => {
  return Course.find({ category: specialization }).distinct('_id');
};

/**
 * @swagger
 * /analytics/tutor/{tutorId}/overview:
 *   get:
 *     summary: Tutor overview analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tutorId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d]
 *         description: Time window for active/engagement metrics
 *     responses:
 *       200:
 *         description: Overview metrics
 */
router.get('/tutor/:tutorId/overview', protect, authorize('tutor', 'admin'), async (req, res) => {
  try {
    const tutor = await User.findById(req.params.tutorId);
    if (!tutor || tutor.role !== 'tutor') return res.status(404).json({ success: false, message: 'Tutor not found' });
    const specialization = tutor.specialization;
    const since = parseTimeframe(req.query.timeframe);

    const totalCourses = await Course.countDocuments({ category: specialization, isPublished: true });

    const studentAgg = await Course.aggregate([
      { $match: { category: specialization, isPublished: true } },
      { $project: { enrolled: { $size: { $ifNull: ['$enrolledStudents', []] } } } },
      { $group: { _id: null, total: { $sum: '$enrolled' } } }
    ]);
    const totalStudents = studentAgg[0]?.total || 0;

    const activeAgg = await Course.aggregate([
      { $match: { category: specialization } },
      { $unwind: { path: '$enrolledStudents', preserveNullAndEmptyArrays: false } },
      { $match: { 'enrolledStudents.lastAccessed': { $gte: since } } },
      { $group: { _id: '$enrolledStudents.student' } },
      { $count: 'active' }
    ]);
    const activeStudents = activeAgg[0]?.active || 0;

    const ratingAgg = await Course.aggregate([
      { $match: { category: specialization, 'rating.count': { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$rating.average' } } }
    ]);
    const averageRating = Math.round((ratingAgg[0]?.avg || 0) * 10) / 10;

    const completionAgg = await Course.aggregate([
      { $match: { category: specialization } },
      { $group: { _id: null, avgCompletion: { $avg: '$completionRate' } } }
    ]);
    const completionRate = Math.round((completionAgg[0]?.avgCompletion || 0));

    res.json({ success: true, data: { totalStudents, activeStudents, totalCourses, averageRating, completionRate } });
  } catch (e) {
    console.error('Overview analytics error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @swagger
 * /analytics/tutor/{tutorId}/recent-performance:
 *   get:
 *     summary: Recent performance metrics and deltas
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tutorId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: timeframe
 *         schema:
 *           type: string
 *           enum: [30d, 90d]
 *     responses:
 *       200:
 *         description: Performance metrics
 */
router.get('/tutor/:tutorId/recent-performance', protect, authorize('tutor', 'admin'), async (req, res) => {
  try {
    const tutor = await User.findById(req.params.tutorId);
    if (!tutor || tutor.role !== 'tutor') return res.status(404).json({ success: false, message: 'Tutor not found' });
    const specialization = tutor.specialization;

    const now = new Date();
    const start = parseTimeframe(req.query.timeframe || '30d');
    const prevStart = new Date(start.getTime() - (now - start)); // previous equal window

    const courseIds = await getSpecializationCourses(specialization);

    // New students = new enrollments in period
    const enrollAgg = await Course.aggregate([
      { $match: { _id: { $in: courseIds } } },
      { $unwind: '$enrolledStudents' },
      { $match: { 'enrolledStudents.enrolledAt': { $gte: start, $lte: now } } },
      { $count: 'count' }
    ]);
    const prevEnrollAgg = await Course.aggregate([
      { $match: { _id: { $in: courseIds } } },
      { $unwind: '$enrolledStudents' },
      { $match: { 'enrolledStudents.enrolledAt': { $gte: prevStart, $lt: start } } },
      { $count: 'count' }
    ]);
    const newStudentsThisPeriod = enrollAgg[0]?.count || 0;
    const prevNewStudents = prevEnrollAgg[0]?.count || 0;

    // Course completions = students with progress 100 in period
    const completeAgg = await Course.aggregate([
      { $match: { _id: { $in: courseIds } } },
      { $unwind: '$enrolledStudents' },
      { $match: { 'enrolledStudents.progress': 100, 'enrolledStudents.lastAccessed': { $gte: start, $lte: now } } },
      { $count: 'count' }
    ]);
    const prevCompleteAgg = await Course.aggregate([
      { $match: { _id: { $in: courseIds } } },
      { $unwind: '$enrolledStudents' },
      { $match: { 'enrolledStudents.progress': 100, 'enrolledStudents.lastAccessed': { $gte: prevStart, $lt: start } } },
      { $count: 'count' }
    ]);
    const completionsThisPeriod = completeAgg[0]?.count || 0;
    const prevCompletions = prevCompleteAgg[0]?.count || 0;

    // Average grade across submissions graded in period
    const gradeAgg = await Submission.aggregate([
      { $match: { courseId: { $in: courseIds }, gradedAt: { $gte: start, $lte: now }, status: 'graded' } },
      { $group: { _id: null, avg: { $avg: '$gradePercentage' } } }
    ]);
    const prevGradeAgg = await Submission.aggregate([
      { $match: { courseId: { $in: courseIds }, gradedAt: { $gte: prevStart, $lt: start }, status: 'graded' } },
      { $group: { _id: null, avg: { $avg: '$gradePercentage' } } }
    ]);
    const averageGrade = Math.round((gradeAgg[0]?.avg || 0));
    const prevAverageGrade = Math.round((prevGradeAgg[0]?.avg || 0));

    // Engagement = unique active students in period
    const engagementAgg = await Course.aggregate([
      { $match: { _id: { $in: courseIds } } },
      { $unwind: '$enrolledStudents' },
      { $match: { 'enrolledStudents.lastAccessed': { $gte: start, $lte: now } } },
      { $group: { _id: '$enrolledStudents.student' } },
      { $count: 'count' }
    ]);
    const prevEngagementAgg = await Course.aggregate([
      { $match: { _id: { $in: courseIds } } },
      { $unwind: '$enrolledStudents' },
      { $match: { 'enrolledStudents.lastAccessed': { $gte: prevStart, $lt: start } } },
      { $group: { _id: '$enrolledStudents.student' } },
      { $count: 'count' }
    ]);
    const engagement = engagementAgg[0]?.count || 0;
    const prevEngagement = prevEngagementAgg[0]?.count || 0;

    const pct = (curr, prev) => {
      if (!prev) return curr ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 100);
    };

    res.json({ success: true, data: {
      newStudents: { value: newStudentsThisPeriod, deltaPct: pct(newStudentsThisPeriod, prevNewStudents) },
      completions: { value: completionsThisPeriod, deltaPct: pct(completionsThisPeriod, prevCompletions) },
      averageGrade: { value: averageGrade, deltaPct: pct(averageGrade, prevAverageGrade) },
      engagement: { value: engagement, deltaPct: pct(engagement, prevEngagement) }
    }});
  } catch (e) {
    console.error('Recent performance error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @swagger
 * /analytics/tutor/{tutorId}/top-courses:
 *   get:
 *     summary: Top performing courses
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 */
router.get('/tutor/:tutorId/top-courses', protect, authorize('tutor', 'admin'), async (req, res) => {
  try {
    const tutor = await User.findById(req.params.tutorId);
    if (!tutor || tutor.role !== 'tutor') return res.status(404).json({ success: false, message: 'Tutor not found' });
    const specialization = tutor.specialization;
    const limit = Math.min(parseInt(req.query.limit || '3'), 10);

    const courses = await Course.find({ category: specialization, isPublished: true })
      .select('title enrolledStudents rating completionRate')
      .sort({ 'rating.average': -1 })
      .limit(limit);

    const top = courses.map(c => ({
      courseId: c._id,
      title: c.title,
      students: c.enrolledStudents?.length || 0,
      rating: c.rating?.average || 0,
      completionRate: c.completionRate || 0
    }));

    res.json({ success: true, data: { top } });
  } catch (e) {
    console.error('Top courses error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @swagger
 * /analytics/tutor/{tutorId}/action-items:
 *   get:
 *     summary: Action items counts
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 */
router.get('/tutor/:tutorId/action-items', protect, authorize('tutor', 'admin'), async (req, res) => {
  try {
    const tutor = await User.findById(req.params.tutorId);
    if (!tutor || tutor.role !== 'tutor') return res.status(404).json({ success: false, message: 'Tutor not found' });
    const specialization = tutor.specialization;
    const courseIds = await getSpecializationCourses(specialization);

    const pendingGradesCount = await Submission.countDocuments({ courseId: { $in: courseIds }, status: { $in: ['submitted', 'under_review'] } });
    // Placeholder for students needing feedback and courses needing update; requires additional signals
    const studentsNeedingFeedbackCount = 5;
    const coursesNeedingUpdateCount = 2;

    res.json({ success: true, data: { pendingGradesCount, studentsNeedingFeedbackCount, coursesNeedingUpdateCount } });
  } catch (e) {
    console.error('Action items error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;


