const express = require('express');
const User = require('../models/User');
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

module.exports = router;
