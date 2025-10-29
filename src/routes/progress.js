const express = require('express');
const router = express.Router();
const Progress = require('../models/Progress');
const Course = require('../models/Course');
const Module = require('../models/Module');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// @desc    Get student's progress for a specific course
// @route   GET /api/progress/course/:courseId
// @access  Private (Student)
router.get('/course/:courseId', protect, authorize('student', 'admin'), async (req, res) => {
  try {
    const { courseId } = req.params;
    const studentId = req.user.id;

    // Check if student is enrolled in the course
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check enrollment using the same logic as auth middleware
    console.log('Checking enrollment for student:', studentId, 'in course:', courseId);
    console.log('Course enrolledStudents:', course.enrolledStudents);
    console.log('User enrolledCourses:', req.user.enrolledCourses);
    
    // Check if user is enrolled in course document (new format)
    const isEnrolledInCourseDoc = Array.isArray(course.enrolledStudents) &&
      course.enrolledStudents.some(e => e.student && e.student.toString() === studentId.toString());
    
    // Check if user is enrolled in course document (old format)
    const isEnrolledInCourseDocOld = Array.isArray(course.enrolledStudents) &&
      course.enrolledStudents.includes(studentId);
    
    // Fallback: check user.enrolledCourses if course doc is not yet updated
    let isEnrolledViaUserDoc = false;
    try {
      const freshUser = await User.findById(studentId).select('enrolledCourses');
      isEnrolledViaUserDoc = Array.isArray(freshUser?.enrolledCourses) && freshUser.enrolledCourses
        .some(c => c && c.toString() === courseId.toString());
    } catch (err) {
      console.log('Error checking user enrollment:', err.message);
    }
    
    const isEnrolled = isEnrolledInCourseDoc || isEnrolledInCourseDocOld || isEnrolledViaUserDoc;
    
    console.log('Enrolled in course (new format):', isEnrolledInCourseDoc);
    console.log('Enrolled in course (old format):', isEnrolledInCourseDocOld);
    console.log('Enrolled via user doc:', isEnrolledViaUserDoc);
    console.log('Final enrollment status:', isEnrolled);
    
    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this course'
      });
    }

    // Get all modules for the course
    const modules = await Module.find({ courseId }).sort({ order: 1 });
    
    // Get progress for each module
    const progressData = await Promise.all(
      modules.map(async (module) => {
        const progress = await Progress.findOne({
          studentId,
          courseId,
          moduleId: module._id
        });

        return {
          moduleId: module._id,
          title: module.title,
          order: module.order,
          status: progress?.status || 'not_started',
          completionPercentage: progress?.completionPercentage || 0,
          timeSpent: progress?.timeSpent || 0,
          lastAccessed: progress?.lastAccessed,
          completedAt: progress?.completedAt,
          isCompleted: progress?.isCompleted || false
        };
      })
    );

    // Calculate overall course progress
    const totalModules = modules.length;
    const completedModules = progressData.filter(p => p.isCompleted).length;
    const courseProgressPercentage = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;

    res.json({
      success: true,
      data: {
        courseId,
        courseTitle: course.title,
        totalModules,
        completedModules,
        courseProgressPercentage,
        modules: progressData
      }
    });

  } catch (error) {
    console.error('Get course progress error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching course progress'
    });
  }
});

// @desc    Get student's overall progress across all courses
// @route   GET /api/progress/student
// @access  Private (Student)
router.get('/student', protect, authorize('student', 'admin'), async (req, res) => {
  try {
    const studentId = req.user.id;

    const progress = await Progress.getStudentProgress(studentId);

    // Group by course
    const courseProgress = {};
    progress.forEach(p => {
      const courseId = p.courseId._id.toString();
      if (!courseProgress[courseId]) {
        courseProgress[courseId] = {
          courseId: p.courseId._id,
          courseTitle: p.courseId.title,
          category: p.courseId.category,
          modules: [],
          totalModules: 0,
          completedModules: 0
        };
      }
      
      courseProgress[courseId].modules.push({
        moduleId: p.moduleId._id,
        title: p.moduleId.title,
        order: p.moduleId.order,
        status: p.status,
        completionPercentage: p.completionPercentage,
        timeSpent: p.timeSpent,
        lastAccessed: p.lastAccessed,
        completedAt: p.completedAt,
        isCompleted: p.isCompleted
      });
      
      courseProgress[courseId].totalModules++;
      if (p.isCompleted) {
        courseProgress[courseId].completedModules++;
      }
    });

    // Fetch time tracking data from Course enrollments
    const courseIds = Object.keys(courseProgress);
    const courses = await Course.find({ _id: { $in: courseIds } })
      .select('_id enrolledStudents');
    
    // Add time spent from course enrollments
    courses.forEach(course => {
      const courseId = course._id.toString();
      if (courseProgress[courseId]) {
        const enrollment = course.enrolledStudents?.find(
          e => e.student && e.student.toString() === studentId.toString()
        );
        
        if (enrollment && enrollment.totalTimeSeconds) {
          // Convert seconds to hours (rounded to 1 decimal place)
          const hoursSpent = Math.round((enrollment.totalTimeSeconds / 3600) * 10) / 10;
          courseProgress[courseId].totalTimeSpent = hoursSpent;
        } else {
          courseProgress[courseId].totalTimeSpent = 0;
        }
      }
    });

    // Calculate progress percentages
    Object.values(courseProgress).forEach(course => {
      course.progressPercentage = course.totalModules > 0 
        ? Math.round((course.completedModules / course.totalModules) * 100) 
        : 0;
      // Ensure totalTimeSpent is set
      if (course.totalTimeSpent === undefined) {
        course.totalTimeSpent = 0;
      }
    });

    res.json({
      success: true,
      data: {
        studentId,
        totalCourses: Object.keys(courseProgress).length,
        courses: Object.values(courseProgress)
      }
    });

  } catch (error) {
    console.error('Get student progress error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching student progress'
    });
  }
});

// @desc    Mark module as completed
// @route   POST /api/progress/complete-module
// @access  Private (Student)
router.post('/complete-module', protect, authorize('student', 'admin'), async (req, res) => {
  try {
    const { courseId, moduleId } = req.body;
    const studentId = req.user.id;

    if (!courseId || !moduleId) {
      return res.status(400).json({
        success: false,
        message: 'Course ID and Module ID are required'
      });
    }

    // Check if student is enrolled
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check enrollment using the same logic as auth middleware
    console.log('Checking enrollment for student:', studentId, 'in course:', courseId);
    console.log('Course enrolledStudents:', course.enrolledStudents);
    console.log('User enrolledCourses:', req.user.enrolledCourses);
    
    // Check if user is enrolled in course document (new format)
    const isEnrolledInCourseDoc = Array.isArray(course.enrolledStudents) &&
      course.enrolledStudents.some(e => e.student && e.student.toString() === studentId.toString());
    
    // Check if user is enrolled in course document (old format)
    const isEnrolledInCourseDocOld = Array.isArray(course.enrolledStudents) &&
      course.enrolledStudents.includes(studentId);
    
    // Fallback: check user.enrolledCourses if course doc is not yet updated
    let isEnrolledViaUserDoc = false;
    try {
      const freshUser = await User.findById(studentId).select('enrolledCourses');
      isEnrolledViaUserDoc = Array.isArray(freshUser?.enrolledCourses) && freshUser.enrolledCourses
        .some(c => c && c.toString() === courseId.toString());
    } catch (err) {
      console.log('Error checking user enrollment:', err.message);
    }
    
    const isEnrolled = isEnrolledInCourseDoc || isEnrolledInCourseDocOld || isEnrolledViaUserDoc;
    
    console.log('Enrolled in course (new format):', isEnrolledInCourseDoc);
    console.log('Enrolled in course (old format):', isEnrolledInCourseDocOld);
    console.log('Enrolled via user doc:', isEnrolledViaUserDoc);
    console.log('Final enrollment status:', isEnrolled);
    
    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this course'
      });
    }

    // Mark module as completed
    const progress = await Progress.markModuleCompleted(studentId, courseId, moduleId);

    res.json({
      success: true,
      message: 'Module marked as completed',
      data: {
        moduleId: progress.moduleId,
        status: progress.status,
        completionPercentage: progress.completionPercentage,
        completedAt: progress.completedAt
      }
    });

  } catch (error) {
    console.error('Mark module completed error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error marking module as completed'
    });
  }
});

// @desc    Update content viewing progress
// @route   POST /api/progress/view-content
// @access  Private (Student)
router.post('/view-content', protect, authorize('student', 'admin'), async (req, res) => {
  try {
    const { courseId, moduleId, contentId, timeSpent = 0 } = req.body;
    const studentId = req.user.id;

    if (!courseId || !moduleId || !contentId) {
      return res.status(400).json({
        success: false,
        message: 'Course ID, Module ID, and Content ID are required'
      });
    }

    // Find or create progress record
    let progress = await Progress.findOne({ studentId, courseId, moduleId });
    
    if (!progress) {
      progress = new Progress({
        studentId,
        courseId,
        moduleId,
        status: 'in_progress'
      });
    }

    // Mark content as viewed
    await progress.markContentViewed(contentId, timeSpent);

    res.json({
      success: true,
      message: 'Content viewing updated',
      data: {
        moduleId: progress.moduleId,
        contentId,
        timeSpent: progress.timeSpent,
        lastAccessed: progress.lastAccessed
      }
    });

  } catch (error) {
    console.error('Update content viewing error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating content viewing'
    });
  }
});

// @desc    Update time spent on module
// @route   POST /api/progress/update-time
// @access  Private (Student)
router.post('/update-time', protect, authorize('student', 'admin'), async (req, res) => {
  try {
    const { courseId, moduleId, timeSpent } = req.body;
    const studentId = req.user.id;

    if (!courseId || !moduleId || timeSpent === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Course ID, Module ID, and time spent are required'
      });
    }

    // Find or create progress record
    let progress = await Progress.findOne({ studentId, courseId, moduleId });
    
    if (!progress) {
      progress = new Progress({
        studentId,
        courseId,
        moduleId,
        status: 'in_progress'
      });
    }

    // Update time spent
    await progress.updateTimeSpent(timeSpent);

    res.json({
      success: true,
      message: 'Time spent updated',
      data: {
        moduleId: progress.moduleId,
        timeSpent: progress.timeSpent,
        lastAccessed: progress.lastAccessed
      }
    });

  } catch (error) {
    console.error('Update time spent error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating time spent'
    });
  }
});

// @desc    Get progress analytics for tutor
// @route   GET /api/progress/analytics/:courseId
// @access  Private (Tutor/Admin)
router.get('/analytics/:courseId', protect, authorize('tutor', 'admin'), async (req, res) => {
  try {
    const { courseId } = req.params;

    // Get all progress for this course
    const progress = await Progress.find({ courseId })
      .populate('studentId', 'firstName lastName email')
      .populate('moduleId', 'title order');

    // Calculate analytics
    const totalStudents = await Course.findById(courseId).then(course => course?.enrolledStudents?.length || 0);
    const totalModules = await Module.countDocuments({ courseId });
    
    const moduleCompletion = {};
    const studentProgress = {};

    progress.forEach(p => {
      const moduleId = p.moduleId._id.toString();
      const studentId = p.studentId._id.toString();

      // Module completion stats
      if (!moduleCompletion[moduleId]) {
        moduleCompletion[moduleId] = {
          moduleId: p.moduleId._id,
          title: p.moduleId.title,
          order: p.moduleId.order,
          totalStudents: 0,
          completedStudents: 0,
          completionRate: 0
        };
      }
      moduleCompletion[moduleId].totalStudents++;
      if (p.isCompleted) {
        moduleCompletion[moduleId].completedStudents++;
      }

      // Student progress
      if (!studentProgress[studentId]) {
        studentProgress[studentId] = {
          studentId: p.studentId._id,
          studentName: `${p.studentId.firstName} ${p.studentId.lastName}`,
          studentEmail: p.studentId.email,
          totalModules: 0,
          completedModules: 0,
          totalTimeSpent: 0
        };
      }
      studentProgress[studentId].totalModules++;
      studentProgress[studentId].totalTimeSpent += p.timeSpent || 0;
      if (p.isCompleted) {
        studentProgress[studentId].completedModules++;
      }
    });

    // Calculate completion rates
    Object.values(moduleCompletion).forEach(module => {
      module.completionRate = module.totalStudents > 0 
        ? Math.round((module.completedStudents / module.totalStudents) * 100) 
        : 0;
    });

    Object.values(studentProgress).forEach(student => {
      student.progressPercentage = student.totalModules > 0 
        ? Math.round((student.completedModules / student.totalModules) * 100) 
        : 0;
    });

    res.json({
      success: true,
      data: {
        courseId,
        totalStudents,
        totalModules,
        moduleCompletion: Object.values(moduleCompletion),
        studentProgress: Object.values(studentProgress)
      }
    });

  } catch (error) {
    console.error('Get progress analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching progress analytics'
    });
  }
});

module.exports = router;
