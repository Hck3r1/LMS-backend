const express = require('express');
const { body, validationResult } = require('express-validator');
const Submission = require('../models/Submission');
const Assignment = require('../models/Assignment');
const Course = require('../models/Course');
const { protect, authorize } = require('../middleware/auth');
const { uploadAssignmentFiles } = require('../middleware/upload');

const router = express.Router();

// @desc    Submit assignment
// @route   POST /api/submissions
// @access  Private (Student only)
router.post('/', [
  protect,
  authorize('student', 'admin'),
  body('assignmentId').isMongoId().withMessage('Valid assignment ID is required'),
  body('textSubmission').optional().isLength({ max: 10000 }).withMessage('Text submission cannot exceed 10000 characters')
], uploadAssignmentFiles, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { assignmentId, textSubmission, codeSubmission } = req.body;

    // Get assignment details
    const assignment = await Assignment.findById(assignmentId)
      .populate('courseId', 'instructor enrolledStudents')
      .populate('moduleId', 'title');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    if (!assignment.isPublished) {
      return res.status(400).json({
        success: false,
        message: 'Assignment is not available for submission'
      });
    }

    // Check if student is enrolled
    const isEnrolled = assignment.courseId.enrolledStudents.some(
      enrollment => enrollment.student.toString() === req.user._id.toString()
    );

    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        message: 'You must be enrolled in this course to submit assignments'
      });
    }

    // Check if student can submit
    if (!assignment.canStudentSubmit(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot submit to this assignment at this time'
      });
    }

    // Get submission number
    const existingSubmissions = await Submission.find({
      assignmentId,
      studentId: req.user._id
    });

    const submissionNumber = existingSubmissions.length + 1;

    // Prepare submission data
    const submissionData = {
      assignmentId,
      studentId: req.user._id,
      courseId: assignment.courseId._id,
      moduleId: assignment.moduleId._id,
      submissionNumber,
      textSubmission,
      codeSubmission: codeSubmission ? JSON.parse(codeSubmission) : undefined,
      status: 'submitted'
    };

    // Add uploaded files if any
    if (req.uploadedFiles && req.uploadedFiles.length > 0) {
      submissionData.files = req.uploadedFiles.map(file => ({
        filename: file.filename,
        originalName: file.originalName,
        url: file.url,
        fileType: file.fileType,
        fileSize: file.fileSize
      }));
    }

    const submission = await Submission.create(submissionData);

    // Add submission to assignment
    assignment.submissions.push(submission._id);
    assignment.totalSubmissions += 1;
    await assignment.save();

    res.status(201).json({
      success: true,
      message: 'Assignment submitted successfully',
      data: { submission }
    });
  } catch (error) {
    console.error('Submit assignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error submitting assignment'
    });
  }
});

// @desc    Get assignment submissions (for tutors)
// @route   GET /api/submissions/assignment/:assignmentId
// @access  Private (Tutor only)
router.get('/assignment/:assignmentId', protect, authorize('tutor', 'admin'), async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.assignmentId)
      .populate('courseId', 'instructor');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    // Verify course ownership
    if (assignment.courseId.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view submissions for this assignment'
      });
    }

    const submissions = await Submission.getAssignmentSubmissions(req.params.assignmentId);

    res.json({
      success: true,
      data: { submissions }
    });
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching submissions'
    });
  }
});

// @desc    Get student submissions
// @route   GET /api/submissions/student/:studentId
// @access  Private (Student or tutor/admin)
router.get('/student/:studentId', protect, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { courseId } = req.query;

    // Check if user is the student or has permission to view
    if (studentId !== req.user._id.toString() && req.user.role !== 'admin' && req.user.role !== 'tutor') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view these submissions'
      });
    }

    const submissions = await Submission.getStudentSubmissions(studentId, courseId);

    res.json({
      success: true,
      data: { submissions }
    });
  } catch (error) {
    console.error('Get student submissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching student submissions'
    });
  }
});

// @desc    Get single submission
// @route   GET /api/submissions/:id
// @access  Private (Student, tutor, admin)
router.get('/:id', protect, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate('studentId', 'firstName lastName email avatar')
      .populate('assignmentId', 'title maxPoints dueDate')
      .populate('courseId', 'title instructor')
      .populate('moduleId', 'title')
      .populate('gradedBy', 'firstName lastName');

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Check permissions
    const isOwner = submission.studentId._id.toString() === req.user._id.toString();
    const isInstructor = submission.courseId.instructor.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isInstructor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this submission'
      });
    }

    res.json({
      success: true,
      data: { submission }
    });
  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching submission'
    });
  }
});

// @desc    Grade submission
// @route   PUT /api/submissions/:id/grade
// @access  Private (Tutor only)
router.put('/:id/grade', [
  protect,
  authorize('tutor', 'admin'),
  body('grade').isFloat({ min: 0, max: 100 }).withMessage('Grade must be between 0 and 100'),
  body('feedback.general').optional().isLength({ max: 2000 }).withMessage('General feedback cannot exceed 2000 characters'),
  body('feedback.strengths').optional().isArray().withMessage('Strengths must be an array'),
  body('feedback.improvements').optional().isArray().withMessage('Improvements must be an array')
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

    const { grade, feedback } = req.body;

    const submission = await Submission.findById(req.params.id)
      .populate('assignmentId', 'courseId maxPoints')
      .populate('courseId', 'instructor');

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Verify course ownership
    if (submission.courseId.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to grade this submission'
      });
    }

    // Update grade and feedback
    await submission.updateGrade(grade, feedback);

    res.json({
      success: true,
      message: 'Submission graded successfully',
      data: { submission }
    });
  } catch (error) {
    console.error('Grade submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error grading submission'
    });
  }
});

// @desc    Add comment to submission
// @route   POST /api/submissions/:id/comments
// @access  Private (Student, tutor, admin)
router.post('/:id/comments', [
  protect,
  body('content').trim().isLength({ min: 1, max: 1000 }).withMessage('Comment must be between 1 and 1000 characters'),
  body('isPrivate').optional().isBoolean().withMessage('isPrivate must be a boolean')
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

    const { content, isPrivate = false } = req.body;

    const submission = await Submission.findById(req.params.id)
      .populate('courseId', 'instructor');

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Check permissions
    const isOwner = submission.studentId.toString() === req.user._id.toString();
    const isInstructor = submission.courseId.instructor.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isInstructor && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to comment on this submission'
      });
    }

    await submission.addComment(req.user._id, content, isPrivate);

    res.json({
      success: true,
      message: 'Comment added successfully'
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error adding comment'
    });
  }
});

// @desc    Get ungraded submissions
// @route   GET /api/submissions/ungraded
// @access  Private (Tutor, admin)
router.get('/ungraded', protect, authorize('tutor', 'admin'), async (req, res) => {
  try {
    const submissions = await Submission.getUngradedSubmissions();

    // Filter by instructor's courses if not admin
    let filteredSubmissions = submissions;
    if (req.user.role !== 'admin') {
      filteredSubmissions = submissions.filter(submission => 
        submission.courseId.instructor.toString() === req.user._id.toString()
      );
    }

    res.json({
      success: true,
      data: { submissions: filteredSubmissions }
    });
  } catch (error) {
    console.error('Get ungraded submissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching ungraded submissions'
    });
  }
});

// @desc    Update submission status
// @route   PUT /api/submissions/:id/status
// @access  Private (Tutor only)
router.put('/:id/status', [
  protect,
  authorize('tutor', 'admin'),
  body('status').isIn(['draft', 'submitted', 'under_review', 'graded', 'returned']).withMessage('Invalid status')
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

    const { status } = req.body;

    const submission = await Submission.findById(req.params.id)
      .populate('courseId', 'instructor');

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Verify course ownership
    if (submission.courseId.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this submission status'
      });
    }

    submission.status = status;
    if (status === 'graded' || status === 'returned') {
      submission.gradedBy = req.user._id;
      submission.gradedAt = new Date();
    }

    await submission.save();

    res.json({
      success: true,
      message: 'Submission status updated successfully',
      data: { submission }
    });
  } catch (error) {
    console.error('Update submission status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating submission status'
    });
  }
});

module.exports = router;

