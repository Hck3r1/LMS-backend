const express = require('express');
const { body, validationResult } = require('express-validator');
const Module = require('../models/Module');
const Course = require('../models/Course');
const { protect, authorize, checkEnrollment } = require('../middleware/auth');
const { uploadModuleContent } = require('../middleware/upload');
const Notification = require('../models/Notification');
const { emitToUser } = require('../utils/socket');

const router = express.Router();

// @desc    Get course modules
// @route   GET /api/modules/course/:courseId
// @access  Private (Enrolled students, tutors, admins)
router.get('/course/:courseId', protect, checkEnrollment, async (req, res) => {
  try {
    // Students: only published; Instructors/Admins: all
    const course = req.course; // set by checkEnrollment
    const baseFilter = { courseId: req.params.courseId };
    // All enrolled users (including students) can view all modules for the course
    const filter = baseFilter;

    // Always include content in response; avoid projecting it away
    const modules = await Module.find(filter)
      .sort({ order: 1 })
      .select('+content')
      .populate('assignments', 'title dueDate maxPoints status');

    res.json({ success: true, data: { modules } });
  } catch (error) {
    console.error('Get modules error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching modules'
    });
  }
});

// @desc    Get single module
// @route   GET /api/modules/:id
// @access  Private (Enrolled students, tutors, admins)
router.get('/:id', protect, async (req, res) => {
  try {
    const module = await Module.getModuleWithContent(req.params.id);

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
        message: 'You must be enrolled in this course to access this module'
      });
    }

    res.json({
      success: true,
      data: { module }
    });
  } catch (error) {
    console.error('Get module error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching module'
    });
  }
});

// @desc    Create module
// @route   POST /api/modules
// @access  Private (Tutor only)
router.post('/', [
  protect,
  authorize('tutor', 'admin'),
  body('courseId').isMongoId().withMessage('Valid course ID is required'),
  body('title').trim().isLength({ min: 5, max: 100 }).withMessage('Title must be between 5 and 100 characters'),
  body('description').trim().isLength({ min: 10, max: 500 }).withMessage('Description must be between 10 and 500 characters'),
  body('order').isInt({ min: 1 }).withMessage('Order must be a positive integer')
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

    const { courseId, title, description, order } = req.body;

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
        message: 'Not authorized to create modules for this course'
      });
    }

    const module = await Module.create({
      courseId,
      title,
      description,
      order
    });

    // Add module to course
    course.modules.push(module._id);
    await course.save();

    // Notify enrolled students of new module (if published later, update route will also handle)
    const enrolled = course.enrolledStudents || [];
    if (enrolled.length) {
      const notifications = enrolled.map(e => ({
        userId: e.student,
        actorId: req.user._id,
        type: 'module',
        title: 'New module added',
        body: `${title} was added to ${course.title}.`,
        link: `/courses/${course._id}`,
        courseId: course._id,
        moduleId: module._id
      }));
      await Notification.insertMany(notifications);
      enrolled.forEach(e => emitToUser(e.student.toString(), 'notification:new', {
        title: 'New module added',
        body: `${title} was added to ${course.title}.`,
        courseId: course._id,
        moduleId: module._id
      }));
    }

    res.status(201).json({
      success: true,
      message: 'Module created successfully',
      data: { module }
    });
  } catch (error) {
    console.error('Create module error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating module'
    });
  }
});

// @desc    Add content to module
// @route   POST /api/modules/:id/content
// @access  Private (Tutor only)
router.post('/:id/content', [
  protect,
  authorize('tutor', 'admin'),
  body('type').isIn(['video', 'pdf', 'text', 'assignment', 'quiz', 'link', 'image']).withMessage('Invalid content type'),
  body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
  body('url').optional().isURL().withMessage('Valid URL is required for this content type')
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

    const module = await Module.findById(req.params.id);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: 'Module not found'
      });
    }

    // Verify course ownership
    const course = await Course.findById(module.courseId);
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add content to this module'
      });
    }

    const contentData = {
      ...req.body,
      order: module.content.length + 1
    };

    await module.addContent(contentData);

    res.json({
      success: true,
      message: 'Content added successfully',
      data: { module }
    });
  } catch (error) {
    console.error('Add content error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error adding content'
    });
  }
});

// @desc    Upload module content files
// @route   POST /api/modules/:id/upload
// @access  Private (Tutor only)
router.post('/:id/upload', protect, authorize('tutor', 'admin'), uploadModuleContent, async (req, res) => {
  try {
    const module = await Module.findById(req.params.id);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: 'Module not found'
      });
    }

    // Verify course ownership
    const course = await Course.findById(module.courseId);
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to upload content to this module'
      });
    }

    if (!req.uploadedFiles || req.uploadedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    // Add uploaded files as content
    const contentPromises = req.uploadedFiles.map(async (file) => {
      const contentType = getContentTypeFromFile(file.fileType);
      return {
        type: contentType,
        title: file.originalName,
        url: file.url,
        order: module.content.length + 1,
        fileSize: file.fileSize
      };
    });

    const newContent = await Promise.all(contentPromises);
    module.content.push(...newContent);
    await module.save();

    res.json({
      success: true,
      message: 'Files uploaded successfully',
      data: { 
        uploadedFiles: req.uploadedFiles,
        module: module
      }
    });
  } catch (error) {
    console.error('Upload module content error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error uploading content'
    });
  }
});

// Helper function to determine content type from file extension
const getContentTypeFromFile = (fileType) => {
  const typeMap = {
    'pdf': 'pdf',
    'jpg': 'image',
    'jpeg': 'image',
    'png': 'image',
    'gif': 'image',
    'mp4': 'video',
    'avi': 'video',
    'mov': 'video',
    'doc': 'pdf',
    'docx': 'pdf',
    'txt': 'text'
  };
  return typeMap[fileType.toLowerCase()] || 'pdf';
};

// @desc    Update module
// @route   PUT /api/modules/:id
// @access  Private (Tutor only)
router.put('/:id', [
  protect,
  authorize('tutor', 'admin'),
  body('title').optional().trim().isLength({ min: 5, max: 100 }).withMessage('Title must be between 5 and 100 characters'),
  body('description').optional().trim().isLength({ min: 10, max: 500 }).withMessage('Description must be between 10 and 500 characters'),
  body('order').optional().isInt({ min: 1 }).withMessage('Order must be a positive integer')
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

    const module = await Module.findById(req.params.id);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: 'Module not found'
      });
    }

    // Verify course ownership
    const course = await Course.findById(module.courseId);
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this module'
      });
    }

    const wasPublished = module.isPublished;
    const updatedModule = await Module.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Module updated successfully',
      data: { module: updatedModule }
    });

    // If module moved to published, notify enrolled students
    if (!wasPublished && updatedModule.isPublished) {
      const course = await Course.findById(updatedModule.courseId);
      const enrolled = course.enrolledStudents || [];
      if (enrolled.length) {
        const notifications = enrolled.map(e => ({
          userId: e.student,
          actorId: req.user._id,
          type: 'module',
          title: 'Module published',
          body: `${updatedModule.title} is now available in ${course.title}.`,
          link: `/courses/${course._id}`,
          courseId: course._id,
          moduleId: updatedModule._id
        }));
        await Notification.insertMany(notifications);
        enrolled.forEach(e => emitToUser(e.student.toString(), 'notification:new', {
          title: 'Module published',
          body: `${updatedModule.title} is now available in ${course.title}.`,
          courseId: course._id,
          moduleId: updatedModule._id
        }));
      }
    }
  } catch (error) {
    console.error('Update module error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating module'
    });
  }
});

// @desc    Delete module
// @route   DELETE /api/modules/:id
// @access  Private (Tutor only)
router.delete('/:id', protect, authorize('tutor', 'admin'), async (req, res) => {
  try {
    const module = await Module.findById(req.params.id);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: 'Module not found'
      });
    }

    // Verify course ownership
    const course = await Course.findById(module.courseId);
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this module'
      });
    }

    await Module.findByIdAndDelete(req.params.id);

    // Remove module from course
    course.modules = course.modules.filter(
      moduleId => moduleId.toString() !== req.params.id
    );
    await course.save();

    res.json({
      success: true,
      message: 'Module deleted successfully'
    });
  } catch (error) {
    console.error('Delete module error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting module'
    });
  }
});

module.exports = router;
