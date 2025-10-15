const express = require('express');
const User = require('../models/User');
const Course = require('../models/Course');
const Submission = require('../models/Submission');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// @desc    Get all tutors
// @route   GET /api/users/tutors
// @access  Public
router.get('/tutors', async (req, res) => {
  try {
    const tutors = await User.find({ role: 'tutor', isActive: true })
      .select('firstName lastName avatar bio specialization rating totalStudents')
      .sort({ 'rating.average': -1 });

    res.json({
      success: true,
      data: { tutors }
    });
  } catch (error) {
    console.error('Get tutors error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching tutors'
    });
  }
});

// @desc    Get tutor profile
// @route   GET /api/users/tutors/:id
// @access  Public
router.get('/tutors/:id', async (req, res) => {
  try {
    const tutor = await User.findById(req.params.id)
      .populate('createdCourses', 'title thumbnail enrolledStudents rating')
      .select('-password -email');

    if (!tutor || tutor.role !== 'tutor') {
      return res.status(404).json({
        success: false,
        message: 'Tutor not found'
      });
    }

    res.json({
      success: true,
      data: { tutor }
    });
  } catch (error) {
    console.error('Get tutor error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching tutor'
    });
  }
});

// @desc    Get user statistics
// @route   GET /api/users/stats
// @access  Private (Admin only)
router.get('/stats', protect, authorize('admin'), async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: ['$isActive', 1, 0] }
          }
        }
      }
    ]);

    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        roleBreakdown: stats
      }
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching user statistics'
    });
  }
});

/**
 * @swagger
 * /users/tutors/{id}/specialization-stats:
 *   get:
 *     summary: Get tutor specialization-based stats
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tutor user ID
 *     responses:
 *       200:
 *         description: Stats computed
 */
router.get('/tutors/:id/specialization-stats', protect, authorize('tutor', 'admin'), async (req, res) => {
  try {
    const tutor = await User.findById(req.params.id);
    if (!tutor || tutor.role !== 'tutor') {
      return res.status(404).json({ success: false, message: 'Tutor not found' });
    }

    const specialization = tutor.specialization;

    // Total Courses created by tutors of this specialization
    const totalCourses = await Course.countDocuments({ category: specialization, isPublished: true });

    // Total Students enrolled in courses of this specialization
    const aggStudents = await Course.aggregate([
      { $match: { category: specialization, isPublished: true } },
      { $project: { enrolledCount: { $size: { $ifNull: ['$enrolledStudents', []] } } } },
      { $group: { _id: null, total: { $sum: '$enrolledCount' } } }
    ]);
    const totalStudents = aggStudents[0]?.total || 0;

    // Pending Grades for assignments submitted to courses in this specialization
    const courseIds = await Course.find({ category: specialization }).distinct('_id');
    const pendingGrades = await Submission.countDocuments({ courseId: { $in: courseIds }, status: { $in: ['submitted', 'under_review'] } });

    // Average Rating across courses in this specialization
    const ratingAgg = await Course.aggregate([
      { $match: { category: specialization, 'rating.count': { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$rating.average' } } }
    ]);
    const averageRating = Math.round((ratingAgg[0]?.avg || 0) * 10) / 10;

    res.json({
      success: true,
      data: {
        specialization,
        totalCourses,
        totalStudents,
        pendingGrades,
        averageRating
      }
    });
  } catch (error) {
    console.error('Specialization stats error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching stats' });
  }
});

module.exports = router;
