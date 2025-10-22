const express = require('express');
const { body, validationResult } = require('express-validator');
const Submission = require('../models/Submission');
const Assignment = require('../models/Assignment');
const Course = require('../models/Course');
const { protect, authorize } = require('../middleware/auth');
const { uploadAssignmentFiles } = require('../middleware/upload');
const Notification = require('../models/Notification');
const { emitToUser } = require('../utils/socket');
const { sendEmail, assignmentGradedTemplate, assignmentSubmittedTemplate } = require('../utils/email');
const { gradeCode } = require('../utils/codeRunner');

const router = express.Router();

/**
 * @swagger
 * /submissions:
 *   post:
 *     summary: Submit an assignment
 *     tags: [Submissions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               assignmentId: { type: string }
 *               textSubmission: { type: string }
 *               codeSubmission: { type: string, description: JSON string }
 *               files: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201:
 *         description: Assignment submitted
 */
router.post('/', [
  protect,
  authorize('student', 'admin'),
  uploadAssignmentFiles,
  body('assignmentId').notEmpty().withMessage('Assignment ID is required').isMongoId().withMessage('Valid assignment ID is required'),
  body('textSubmission').optional().isLength({ max: 10000 }).withMessage('Text submission cannot exceed 10000 characters')
], async (req, res) => {
  try {
    // Debug logging
    console.log('📝 Submission request received:');
    console.log('Body:', req.body);
    console.log('Files:', req.files);
    console.log('AssignmentId from body:', req.body.assignmentId);
    console.log('AssignmentId type:', typeof req.body.assignmentId);
    
    // Manual validation check
    const mongoose = require('mongoose');
    const isValidObjectId = mongoose.Types.ObjectId.isValid(req.body.assignmentId);
    console.log('Is valid ObjectId:', isValidObjectId);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
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

    // Debug: Log assignment details
    console.log('📋 Assignment details:');
    console.log('Title:', assignment.title);
    console.log('isPublished:', assignment.isPublished);
    console.log('Type:', assignment.type);
    console.log('Due Date:', assignment.dueDate);

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
      // Check for upload errors
      const failedUploads = req.uploadedFiles.filter(file => !file.url || file.error);
      if (failedUploads.length > 0) {
        console.error('Some files failed to upload:', failedUploads);
        return res.status(400).json({
          success: false,
          message: 'Some files failed to upload. Please try again.',
          failedFiles: failedUploads.map(f => f.originalName)
        });
      }

      submissionData.files = req.uploadedFiles.map(file => ({
        filename: file.filename,
        originalName: file.originalName,
        url: file.url,
        fileType: file.fileType,
        fileSize: file.fileSize
      }));
    }

    const submission = await Submission.create(submissionData);

    // If assignment is code_submission and has tests (in assignment.instructions JSON), auto-grade
    try {
      if (assignment.type === 'code_submission') {
        const meta = (() => { try { return JSON.parse(assignment.instructions || '{}'); } catch { return {}; } })();
        if (meta.entry && Array.isArray(meta.tests)) {
          const result = gradeCode({ code: submission.textSubmission || (submission.codeSubmission?.source || ''), entry: meta.entry, tests: meta.tests });
          submission.gradePercentage = result.percentage;
          submission.status = 'graded';
          submission.gradedAt = new Date();
          await submission.save();
        }
      }
    } catch (_) {}

    // Add submission to assignment
    assignment.submissions.push(submission._id);
    assignment.totalSubmissions += 1;
    await assignment.save();

    res.status(201).json({
      success: true,
      message: 'Assignment submitted successfully',
      data: { submission }
    });
    // Email tutor about new submission (best-effort)
    try {
      const tutorId = assignment.courseId.instructor;
      const tutor = await require('../models/User').findById(tutorId);
      const template = assignmentSubmittedTemplate({ tutorName: tutor?.firstName, courseTitle: assignment.courseId.title || 'Course', assignmentTitle: assignment.title, studentName: req.user.firstName });
      if (tutor?.email) await sendEmail({ to: tutor.email, ...template });
    } catch (e) {
      console.warn('Email new submission failed:', e.message);
    }
  } catch (error) {
    console.error('Submit assignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error submitting assignment'
    });
  }
});

/**
 * @swagger
 * /submissions/assignment/{assignmentId}:
 *   get:
 *     summary: Get submissions for a specific assignment
 *     tags: [Submissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of submissions
 */
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

/**
 * @swagger
 * /submissions/student/{studentId}:
 *   get:
 *     summary: Get submissions for a student
 *     tags: [Submissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: courseId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of submissions
 */
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

// @desc    Get recent submissions for tutor's courses (graded or ungraded)
// @route   GET /api/submissions/recent?limit=10
// @access  Private (Tutor/Admin)
router.get('/recent', protect, authorize('tutor', 'admin'), async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit || '10', 10)));
    const submissions = await Submission.find({})
      .sort({ createdAt: -1 })
      .limit(limit * 5)
      .populate('studentId', 'firstName lastName avatar')
      .populate('assignmentId', 'title')
      .populate('courseId', 'title instructor')
      .lean();

    const filtered = req.user.role === 'admin'
      ? submissions
      : submissions.filter(s => String(s.courseId?.instructor) === String(req.user._id));

    return res.json({ success: true, data: { submissions: filtered.slice(0, limit) } });
  } catch (error) {
    console.error('Get recent submissions error:', error?.message, error?.stack);
    return res.status(500).json({ success: false, message: 'Server error fetching recent submissions' });
  }
});

/**
 * @swagger
 * /submissions/{id}:
 *   get:
 *     summary: Get a single submission by ID
 *     tags: [Submissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Submission details
 */
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

    // Check permissions (null-safe)
    const isOwner = submission?.studentId && submission.studentId._id && submission.studentId._id.toString() === req.user._id.toString();
    const isInstructor = submission?.courseId && submission.courseId.instructor && submission.courseId.instructor.toString() === req.user._id.toString();
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
    console.error('Get submission error:', error?.message, error?.stack);
    res.status(500).json({
      success: false,
      message: 'Server error fetching submission'
    });
  }
});

/**
 * @swagger
 * /submissions/{id}/grade:
 *   put:
 *     summary: Grade a submission
 *     tags: [Submissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               grade: { type: number }
 *               feedback:
 *                 type: object
 *                 properties:
 *                   general: { type: string }
 *                   strengths: { type: array, items: { type: string } }
 *                   improvements: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: Submission graded
 */
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

    // Add notification after grading
    const sub = await Submission.findById(req.params.id);
    console.log('🔔 Creating grade notification for student:', sub.studentId, 'by instructor:', req.user._id);
    await Notification.create({
      userId: sub.studentId,
      actorId: req.user._id,
      type: 'grade',
      title: 'Assignment graded',
      body: 'Your submission has been graded.',
      link: `/assignments/${sub.assignmentId}`,
      courseId: sub.courseId,
      moduleId: sub.moduleId,
      assignmentId: sub.assignmentId
    });
  emitToUser(sub.studentId.toString(), 'notification:new', {
    title: 'Assignment graded',
    body: 'Your submission has been graded.',
    assignmentId: sub.assignmentId,
    courseId: sub.courseId
  });

    // Email student about grading (best-effort)
    try {
      const student = await require('../models/User').findById(sub.studentId);
      const template = assignmentGradedTemplate({ studentName: student?.firstName, courseTitle: submission.courseId.title || 'Course', assignmentTitle: submission.assignmentId.title || 'Assignment', grade: submission.gradePercentage || 0 });
      if (student?.email) await sendEmail({ to: student.email, ...template });
    } catch (e) {
      console.warn('Email graded failed:', e.message);
    }

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

/**
 * @swagger
 * /submissions/{id}/comments:
 *   post:
 *     summary: Add a comment to a submission
 *     tags: [Submissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content: { type: string }
 *               isPrivate: { type: boolean }
 *     responses:
 *       200:
 *         description: Comment added
 */
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

/**
 * @swagger
 * /submissions/ungraded:
 *   get:
 *     summary: Get ungraded submissions (for tutor/admin)
 *     tags: [Submissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of ungraded submissions
 */
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

// @desc    Get recent submissions for tutor's courses (graded or ungraded)
// @route   GET /api/submissions/recent?limit=10
// @access  Private (Tutor/Admin)
router.get('/recent', protect, authorize('tutor', 'admin'), async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit || '10', 10)));
    // Find submissions for courses owned by this tutor (or all if admin)
    const filter = {};
    if (req.user.role !== 'admin') {
      // We'll filter after populate because courseId is needed
    }

    const submissions = await Submission.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 5) // over-fetch then filter by instructor below
      .populate('studentId', 'firstName lastName avatar')
      .populate('assignmentId', 'title')
      .populate('courseId', 'title instructor')
      .lean();

    const filtered = req.user.role === 'admin'
      ? submissions
      : submissions.filter(s => String(s.courseId?.instructor) === String(req.user._id));

    const limited = filtered.slice(0, limit);

    res.json({
      success: true,
      data: { submissions: limited }
    });
  } catch (error) {
    console.error('Get recent submissions error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching recent submissions' });
  }
});

/**
 * @swagger
 * /submissions/{id}/status:
 *   put:
 *     summary: Update submission status
 *     tags: [Submissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: [draft, submitted, under_review, graded, returned] }
 *     responses:
 *       200:
 *         description: Status updated
 */
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

