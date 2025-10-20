const express = require('express');
const { body, validationResult } = require('express-validator');
const Assignment = require('../models/Assignment');
const Course = require('../models/Course');
const Module = require('../models/Module');
const { protect, authorize, checkEnrollment } = require('../middleware/auth');
const { uploadAssignmentFiles } = require('../middleware/upload');
const Notification = require('../models/Notification');
const { emitToUser } = require('../utils/socket');
const { sendEmail, assignmentDueSoonTemplate, assignmentCreatedTemplate } = require('../utils/email');

const router = express.Router();

// @desc    Get assignments for a module
// @route   GET /api/assignments/module/:moduleId
// @access  Private (Enrolled students, tutors, admins)
router.get('/module/:moduleId', protect, async (req, res) => {
  try {
    const module = await Module.findById(req.params.moduleId);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: 'Module not found'
      });
    }

    // Check enrollment
    const course = await Course.findById(module.courseId);
    const isEnrolled = course.enrolledStudents.some(
      enrollment => enrollment.student.toString() === req.user._id.toString()
    );
    const isInstructor = course.instructor.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isEnrolled && !isInstructor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You must be enrolled in this course to view assignments'
      });
    }

    // Students: only published; Instructors/Admins: all
    const isInstructor = course.instructor.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    const assignments = (isInstructor || isAdmin)
      ? await Assignment.find({ moduleId: req.params.moduleId }).sort({ dueDate: 1 }).populate('moduleId', 'title').populate('courseId', 'title')
      : await Assignment.getModuleAssignments(req.params.moduleId);

    res.json({
      success: true,
      data: { assignments }
    });
  } catch (error) {
    console.error('Get assignments error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching assignments'
    });
  }
});

// @desc    Get single assignment
// @route   GET /api/assignments/:id
// @access  Private (Enrolled students, tutors, admins)
router.get('/:id', protect, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('moduleId', 'title courseId')
      .populate('courseId', 'title instructor')
      .populate('submissions', 'studentId submittedAt status grade');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    // Check enrollment
    const course = await Course.findById(assignment.courseId);
    const isEnrolled = course.enrolledStudents.some(
      enrollment => enrollment.student.toString() === req.user._id.toString()
    );
    const isInstructor = course.instructor.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isEnrolled && !isInstructor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You must be enrolled in this course to view this assignment'
      });
    }

    res.json({
      success: true,
      data: { assignment }
    });
  } catch (error) {
    console.error('Get assignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching assignment'
    });
  }
});

// @desc    Create assignment
// @route   POST /api/assignments
// @access  Private (Tutor only)
router.post('/', [
  protect,
  authorize('tutor', 'admin'),
  body('moduleId').isMongoId().withMessage('Valid module ID is required'),
  body('courseId').isMongoId().withMessage('Valid course ID is required'),
  body('title').trim().isLength({ min: 5, max: 100 }).withMessage('Title must be between 5 and 100 characters'),
  body('description').trim().isLength({ min: 10, max: 2000 }).withMessage('Description must be between 10 and 2000 characters'),
  body('instructions').trim().isLength({ min: 10, max: 5000 }).withMessage('Instructions must be between 10 and 5000 characters'),
  body('type').isIn(['file_upload', 'text_submission', 'code_submission', 'quiz', 'project']).withMessage('Invalid assignment type'),
  body('dueDate').isISO8601().withMessage('Valid due date is required'),
  body('maxPoints').isInt({ min: 1, max: 1000 }).withMessage('Max points must be between 1 and 1000')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { moduleId, courseId, title, description, instructions, type, dueDate, maxPoints } = req.body;

    // Verify course ownership
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create assignments for this course'
      });
    }

    const assignment = await Assignment.create({
      moduleId,
      courseId,
      title,
      description,
      instructions,
      type,
      dueDate,
      maxPoints
    });

    // Notify enrolled students of new assignment
    const enrolled = course.enrolledStudents || [];
    const notifications = enrolled.map(e => ({
      userId: e.student,
      actorId: req.user._id,
      type: 'assignment',
      title: 'New assignment',
      body: `${title} has been posted in ${course.title}.`,
      link: `/courses/${course._id}/modules/${moduleId}`,
      courseId: course._id,
      moduleId,
      assignmentId: assignment._id
    }));
    if (notifications.length) {
      console.log('🔔 Creating assignment notifications for:', title, 'to users:', notifications.map(n => n.userId));
      await Notification.insertMany(notifications);
    }
    // Emit to users in real-time
    (course.enrolledStudents || []).forEach(e => emitToUser(e.student.toString(), 'notification:new', {
      title: 'New assignment',
      body: `${title} has been posted in ${course.title}.`,
      courseId: course._id,
      moduleId,
      assignmentId: assignment._id
    }));

    // Email enrolled students (best-effort)
    try {
      const User = require('../models/User');
      const students = await User.find({ _id: { $in: enrolled.map(s => s.student) } }).select('email firstName').lean();
      for (const s of students) {
        if (!s.email) continue;
        const template = assignmentCreatedTemplate({ studentName: s.firstName, courseTitle: course.title, assignmentTitle: title, dueDate: new Date(dueDate).toLocaleString() });
        await sendEmail({ to: s.email, ...template });
      }
    } catch (e) {
      console.warn('Email assignment created failed:', e.message);
    }

    res.status(201).json({
      success: true,
      message: 'Assignment created successfully',
      data: { assignment }
    });
  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating assignment'
    });
  }
});

// @desc    Upload assignment files
// @route   POST /api/assignments/:id/upload
// @access  Private (Tutor only)
router.post('/:id/upload', protect, authorize('tutor', 'admin'), uploadAssignmentFiles, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    // Verify course ownership
    const course = await Course.findById(assignment.courseId);
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to upload files for this assignment'
      });
    }

    if (!req.uploadedFiles || req.uploadedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    // Add uploaded files as attachments
    const attachments = req.uploadedFiles.map(file => ({
      filename: file.filename,
      url: file.url,
      fileType: file.fileType,
      fileSize: file.fileSize,
      description: file.originalName
    }));

    assignment.attachments = [...assignment.attachments, ...attachments];
    await assignment.save();

    res.json({
      success: true,
      message: 'Files uploaded successfully',
      data: { 
        uploadedFiles: req.uploadedFiles,
        assignment: assignment
      }
    });
  } catch (error) {
    console.error('Upload assignment files error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error uploading files'
    });
  }
});

// @desc    Update assignment
// @route   PUT /api/assignments/:id
// @access  Private (Tutor only)
router.put('/:id', [
  protect,
  authorize('tutor', 'admin'),
  body('title').optional().trim().isLength({ min: 5, max: 100 }).withMessage('Title must be between 5 and 100 characters'),
  body('description').optional().trim().isLength({ min: 10, max: 2000 }).withMessage('Description must be between 10 and 2000 characters'),
  body('instructions').optional().trim().isLength({ min: 10, max: 5000 }).withMessage('Instructions must be between 10 and 5000 characters'),
  body('dueDate').optional().isISO8601().withMessage('Valid due date is required'),
  body('maxPoints').optional().isInt({ min: 1, max: 1000 }).withMessage('Max points must be between 1 and 1000')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    // Verify course ownership
    const course = await Course.findById(assignment.courseId);
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this assignment'
      });
    }

    const updatedAssignment = await Assignment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Assignment updated successfully',
      data: { assignment: updatedAssignment }
    });
  } catch (error) {
    console.error('Update assignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating assignment'
    });
  }
});

// @desc    Delete assignment
// @route   DELETE /api/assignments/:id
// @access  Private (Tutor only)
router.delete('/:id', protect, authorize('tutor', 'admin'), async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    // Verify course ownership
    const course = await Course.findById(assignment.courseId);
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this assignment'
      });
    }

    await Assignment.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Assignment deleted successfully'
    });
  } catch (error) {
    console.error('Delete assignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting assignment'
    });
  }
});

// @desc    Get assignment statistics
// @route   GET /api/assignments/:id/stats
// @access  Private (Tutor only)
router.get('/:id/stats', protect, authorize('tutor', 'admin'), async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    // Verify course ownership
    const course = await Course.findById(assignment.courseId);
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view assignment statistics'
      });
    }

    const stats = await assignment.getStatistics();

    res.json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error('Get assignment stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching assignment statistics'
    });
  }
});

module.exports = router;
