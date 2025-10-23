const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Course = require('../models/Course');
const User = require('../models/User');
const { protect, authorize, optionalAuth, checkEnrollment } = require('../middleware/auth');
const { uploadThumbnail, uploadBanner } = require('../middleware/upload');
const Notification = require('../models/Notification');
const { emitToUser } = require('../utils/socket');
const { body: vbody } = require('express-validator');

const router = express.Router();
/**
 * @swagger
 * /courses/instructor/{id}:
 *   get:
 *     summary: List all courses for an instructor (includes drafts)
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 */
router.get('/instructor/:id', protect, async (req, res) => {
  try {
    const instructorId = req.params.id;
    const isOwner = req.user._id.toString() === instructorId || req.user.role === 'admin';
    const filter = isOwner ? { instructor: instructorId } : { instructor: instructorId, isPublished: true };
    const courses = await Course.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: { courses } });
  } catch (e) {
    console.error('List instructor courses error:', e);
    res.status(500).json({ success: false, message: 'Server error fetching instructor courses' });
  }
});

/**
 * @swagger
 * /courses/{id}/students:
 *   get:
 *     summary: List enrolled students for a course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id/students', protect, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).populate('enrolledStudents.student', 'firstName lastName email avatar');
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    const isOwner = course.instructor.toString() === req.user._id.toString() || req.user.role === 'admin';
    if (!isOwner) return res.status(403).json({ success: false, message: 'Not authorized to view enrolled students' });
    res.json({ success: true, data: { students: course.enrolledStudents } });
  } catch (e) {
    console.error('List course students error:', e);
    res.status(500).json({ success: false, message: 'Server error fetching enrolled students' });
  }
});

/**
 * @swagger
 * /courses:
 *   get:
 *     summary: Get all courses with filtering and pagination
 *     tags: [Courses]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Number of courses per page
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [web-development, ui-ux, data-science, video-editing, graphics-design]
 *         description: Filter by course category
 *       - in: query
 *         name: difficulty
 *         schema:
 *           type: string
 *           enum: [beginner, intermediate, advanced]
 *         description: Filter by difficulty level
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for course title and description
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, oldest, rating, popular]
 *         description: Sort order for courses
 *     responses:
 *       200:
 *         description: List of courses retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     courses:
 *                       type: array
 *                       items:
 *                         allOf:
 *                           - $ref: '#/components/schemas/Course'
 *                           - type: object
 *                             properties:
 *                               isEnrolled:
 *                                 type: boolean
 *                                 description: Whether the authenticated user is enrolled in this course (only present for authenticated users)
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         totalCourses:
 *                           type: integer
 *                         hasNext:
 *                           type: boolean
 *                         hasPrev:
 *                           type: boolean
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('category').optional().isIn(['web-development', 'ui-ux', 'data-science', 'video-editing', 'graphics-design']).withMessage('Invalid category'),
  query('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty'),
  query('search').optional().isLength({ min: 1 }).withMessage('Search term cannot be empty'),
  query('sort').optional().isIn(['newest', 'oldest', 'rating', 'popular']).withMessage('Invalid sort option'),
  query('instructor').optional().isMongoId().withMessage('Invalid instructor id')
], optionalAuth, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    // Build filter object
    let filter = { isPublished: true };

    if (req.query.category) {
      filter.category = req.query.category;
    }

    if (req.query.difficulty) {
      filter.difficulty = req.query.difficulty;
    }

    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }

    // If instructor filter provided and authorized, show all courses by instructor (published or drafts)
    if (req.query.instructor) {
      const isOwner = req.user && (req.user._id.toString() === req.query.instructor || req.user.role === 'admin');
      if (isOwner) {
        filter = { instructor: req.query.instructor };
      } else {
        // if not owner, still restrict to published courses of that instructor
        filter = { instructor: req.query.instructor, isPublished: true };
      }
    }

    // Build sort object
    let sort = {};
    switch (req.query.sort) {
      case 'newest':
        sort = { createdAt: -1 };
        break;
      case 'oldest':
        sort = { createdAt: 1 };
        break;
      case 'rating':
        sort = { 'rating.average': -1 };
        break;
      case 'popular':
        sort = { 'enrolledStudents': -1 };
        break;
      default:
        sort = { createdAt: -1 };
    }

    const courses = await Course.find(filter)
      .populate('instructor', 'firstName lastName avatar specialization rating')
      .populate('enrolledStudents.student', '_id')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await Course.countDocuments(filter);

    // Add isEnrolled field for authenticated users
    let coursesWithEnrollment = courses;
    if (req.user) {
      console.log('📚 Adding enrollment status for user:', req.user.email);
      coursesWithEnrollment = courses.map(course => {
        const courseObj = course.toObject();
        // Check if user is enrolled in this course
        const isEnrolled = course.enrolledStudents && course.enrolledStudents.some(
          enrollment => enrollment.student && enrollment.student.toString() === req.user._id.toString()
        );
        courseObj.isEnrolled = !!isEnrolled;
        return courseObj;
      });
      console.log('📚 Enrollment status added to', coursesWithEnrollment.length, 'courses');
    }

    res.json({
      success: true,
      data: {
        courses: coursesWithEnrollment,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalCourses: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching courses'
    });
  }
});

/**
 * @swagger
 * /courses/{id}:
 *   get:
 *     summary: Get a single course by ID
 *     tags: [Courses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Course ID
 *     responses:
 *       200:
 *         description: Course retrieved
 *       404:
 *         description: Course not found
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('instructor', 'firstName lastName avatar bio specialization rating totalStudents')
      .populate('modules', 'title description order estimatedTime')
      .populate('prerequisites', 'title thumbnail difficulty')
      .populate('enrolledStudents.student', '_id');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user is enrolled (if authenticated)
    let isEnrolled = false;
    if (req.user) {
      console.log('📚 Checking enrollment for user:', req.user.email, 'in course:', course.title);
      isEnrolled = course.enrolledStudents && course.enrolledStudents.some(
        enrollment => enrollment.student && enrollment.student.toString() === req.user._id.toString()
      );
      console.log('📚 User enrollment status:', isEnrolled);
    }

    res.json({
      success: true,
      data: {
        course: {
          ...course.toObject(),
          isEnrolled
        }
      }
    });
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching course'
    });
  }
});

/**
 * @swagger
 * /courses:
 *   post:
 *     summary: Create a new course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, category, difficulty, duration]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               category: { type: string, enum: [web-development, ui-ux, data-science, video-editing, graphics-design] }
 *               difficulty: { type: string, enum: [beginner, intermediate, advanced] }
 *               duration: { type: integer, minimum: 1 }
 *               learningObjectives: { type: array, items: { type: string } }
 *               tags: { type: array, items: { type: string } }
 *     responses:
 *       201:
 *         description: Course created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', [
  protect,
  authorize('tutor', 'admin'),
  body('title').trim().isLength({ min: 5, max: 100 }).withMessage('Title must be between 5 and 100 characters'),
  body('description').trim().isLength({ min: 10, max: 1000 }).withMessage('Description must be between 10 and 1000 characters'),
  body('category').isIn(['web-development', 'ui-ux', 'data-science', 'video-editing', 'graphics-design']).withMessage('Invalid category'),
  body('difficulty').isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty'),
  body('duration').isInt({ min: 1 }).withMessage('Duration must be at least 1 hour'),
  // price removed for free LMS
  // learningObjectives can be string (newline/comma separated) or array; validated in handler
  body('tags').optional().isArray().withMessage('Tags must be an array')
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

    // Coerce learningObjectives to array if provided as a string
    if (typeof req.body.learningObjectives === 'string') {
      req.body.learningObjectives = req.body.learningObjectives
        .split(/[\n,]/)
        .map(s => s.trim())
        .filter(Boolean);
    }
    // Normalize prerequisites: expect array of ObjectIds; if string or invalid, drop
    if (typeof req.body.prerequisites === 'string') {
      // free text not supported for ObjectId field; ignore
      delete req.body.prerequisites;
    } else if (Array.isArray(req.body.prerequisites)) {
      const isObjectId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
      const filtered = req.body.prerequisites.filter(isObjectId);
      req.body.prerequisites = filtered;
    }
    // Validate learning objectives content length (10-100 chars each)
    if (Array.isArray(req.body.learningObjectives)) {
      const invalid = req.body.learningObjectives.find(obj => obj.length < 10 || obj.length > 100);
      if (invalid) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: [{ path: 'learningObjectives', msg: 'Each learning objective must be between 10 and 100 characters' }]
        });
      }
    }
    const courseData = {
      ...req.body,
      instructor: req.user._id
    };

    const course = await Course.create(courseData);

    // Update user's created courses
    await User.findByIdAndUpdate(req.user._id, {
      $push: { createdCourses: course._id }
    });

    res.status(201).json({
      success: true,
      message: 'Course created successfully',
      data: { course }
    });

    // Announce new course to students of this specialization (optional scope)
    const interestedStudents = await User.find({ role: 'student', specialization: course.category }).select('_id');
    if (interestedStudents.length) {
      const notifications = interestedStudents.map(s => ({
        userId: s._id,
        actorId: req.user._id,
        type: 'announcement',
        title: 'New course published',
        body: `${course.title} is now available.`,
        link: `/courses/${course._id}`,
        courseId: course._id
      }));
      console.log('🔔 Creating notifications for course:', course.title, 'to users:', notifications.map(n => n.userId));
      await Notification.insertMany(notifications);
      interestedStudents.forEach(s => emitToUser(s._id.toString(), 'notification:new', {
        title: 'New course published',
        body: `${course.title} is now available.`,
        courseId: course._id
      }));
    }
  } catch (error) {
    console.error('Create course error:', error);
    if (error.name === 'ValidationError') {
      const errors = Object.keys(error.errors).map((k) => ({ path: k, msg: error.errors[k].message }));
      return res.status(400).json({ success: false, message: 'Validation failed', errors });
    }
    res.status(500).json({ success: false, message: 'Server error creating course' });
  }
});

/**
 * @swagger
 * /courses/{id}:
 *   put:
 *     summary: Update a course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               category: { type: string, enum: [web-development, ui-ux, data-science, video-editing, graphics-design] }
 *               difficulty: { type: string, enum: [beginner, intermediate, advanced] }
 *               duration: { type: integer, minimum: 1 }
 *               # price removed for free LMS
 *     responses:
 *       200:
 *         description: Course updated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Course not found
 */
router.put('/:id', [
  protect,
  authorize('tutor', 'admin'),
  body('title').optional().trim().isLength({ min: 5, max: 100 }).withMessage('Title must be between 5 and 100 characters'),
  body('description').optional().trim().isLength({ min: 10, max: 1000 }).withMessage('Description must be between 10 and 1000 characters'),
  body('category').optional().isIn(['web-development', 'ui-ux', 'data-science', 'video-editing', 'graphics-design']).withMessage('Invalid category'),
  body('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid difficulty'),
  body('duration').optional().isInt({ min: 1 }).withMessage('Duration must be at least 1 hour'),
  // price removed for free LMS
], async (req, res) => {
  try {
    console.log('➡️ Update course request body:', req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user is the instructor or admin
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this course'
      });
    }

    // Normalize learningObjectives and prerequisites prior to update
    if (typeof req.body.learningObjectives === 'string') {
      req.body.learningObjectives = req.body.learningObjectives
        .split(/\n|,/)
        .map(s => s.trim())
        .filter(Boolean);
    }
    if (typeof req.body.prerequisites === 'string') {
      // Frontend may pass free text like 'None'; prerequisites expects ObjectId[] → drop invalid
      delete req.body.prerequisites;
    } else if (Array.isArray(req.body.prerequisites)) {
      const isObjectId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
      const filtered = req.body.prerequisites.filter(isObjectId);
      req.body.prerequisites = filtered;
    }

    const updatedCourse = await Course.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    // Auto-publish modules and assignments when course is published
    if (req.body.isPublished === true && !course.isPublished) {
      console.log('🚀 Course published, auto-publishing modules and assignments...');
      
      try {
        // Import models
        const Module = require('../models/Module');
        const Assignment = require('../models/Assignment');
        
        // Publish all modules in this course
        const modulesResult = await Module.updateMany(
          { courseId: req.params.id },
          { isPublished: true }
        );
        const modulesModified = typeof modulesResult?.modifiedCount === 'number' ? modulesResult.modifiedCount : (modulesResult?.nModified || 0);
        console.log(`📚 Published ${modulesModified} modules`);
        
        // Publish all assignments in this course
        const assignmentsResult = await Assignment.updateMany(
          { courseId: req.params.id },
          { isPublished: true }
        );
        const assignmentsModified = typeof assignmentsResult?.modifiedCount === 'number' ? assignmentsResult.modifiedCount : (assignmentsResult?.nModified || 0);
        console.log(`📝 Published ${assignmentsModified} assignments`);
        
        console.log('✅ Auto-publish completed successfully');
      } catch (autoPublishError) {
        console.error('⚠️ Auto-publish failed:', autoPublishError?.message, autoPublishError?.stack);
        // Don't fail the course update if auto-publish fails
      }
    }

    res.json({
      success: true,
      message: 'Course updated successfully',
      data: { course: updatedCourse }
    });
  } catch (error) {
    console.error('Update course error:', error?.message, error?.stack);
    res.status(500).json({
      success: false,
      message: 'Server error updating course'
    });
  }
});

// @desc    Get full course structure (course + modules + assignments)
// @route   GET /api/courses/:id/structure
// @access  Private (Tutor/Admin)
router.get('/:id/structure', [
  protect,
  authorize('tutor', 'admin')
], async (req, res) => {
  try {
    const Course = require('../models/Course');
    const Module = require('../models/Module');
    const Assignment = require('../models/Assignment');

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Ownership check
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to view this course structure' });
    }

    // Fetch all modules with content (include unpublished)
    const modules = await Module.find({ courseId: req.params.id })
      .select('+content')
      .sort({ order: 1, createdAt: 1 })
      .lean();

    const moduleIds = modules.map(m => m._id);
    // Fetch all assignments for these modules (include unpublished)
    const assignments = await Assignment.find({ moduleId: { $in: moduleIds } })
      .sort({ dueDate: 1, createdAt: 1 })
      .lean();

    const assignmentsByModuleId = assignments.reduce((acc, a) => {
      const key = String(a.moduleId);
      if (!acc[key]) acc[key] = [];
      acc[key].push(a);
      return acc;
    }, {});

    const modulesWithAssignments = modules.map(m => ({
      ...m,
      assignments: assignmentsByModuleId[String(m._id)] || []
    }));

    return res.json({
      success: true,
      data: {
        course,
        modules: modulesWithAssignments
      }
    });
  } catch (error) {
    console.error('Get course structure error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching course structure' });
  }
});

/**
 * @swagger
 * /courses/{id}/thumbnail:
 *   post:
 *     summary: Upload course thumbnail image
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               thumbnail:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Thumbnail uploaded
 *       400:
 *         description: No file uploaded
 *       401:
 *         description: Unauthorized
 */
router.post('/:id/thumbnail', protect, uploadThumbnail, async (req, res) => {
  try {
    console.log('📸 Thumbnail upload request:', {
      courseId: req.params.id,
      hasFile: !!req.file,
      hasUploadedFile: !!req.uploadedFile,
      uploadedFile: req.uploadedFile
    });

    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user is the instructor or admin
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this course'
      });
    }

    if (!req.uploadedFile) {
      console.error('❌ No uploadedFile found in request');
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    console.log('💾 Saving thumbnail URL to database:', req.uploadedFile.url);
    course.thumbnail = req.uploadedFile.url;
    await course.save();
    console.log('✅ Course saved with thumbnail:', course.thumbnail);

    res.json({
      success: true,
      message: 'Thumbnail uploaded successfully',
      data: {
        thumbnail: course.thumbnail
      }
    });
  } catch (error) {
    console.error('Upload thumbnail error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error uploading thumbnail'
    });
  }
});

/**
 * @swagger
 * /courses/{id}/banner:
 *   post:
 *     summary: Upload course banner image
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               banner:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Banner uploaded
 *       400:
 *         description: No file uploaded
 *       401:
 *         description: Unauthorized
 */
router.post('/:id/banner', protect, uploadBanner, async (req, res) => {
  try {
    console.log('🖼️ Banner upload request:', {
      courseId: req.params.id,
      hasFile: !!req.file,
      hasUploadedFile: !!req.uploadedFile,
      uploadedFile: req.uploadedFile
    });

    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user is the instructor or admin
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this course'
      });
    }

    if (!req.uploadedFile) {
      console.error('❌ No uploadedFile found in request');
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    console.log('💾 Saving banner URL to database:', req.uploadedFile.url);
    course.banner = req.uploadedFile.url;
    await course.save();
    console.log('✅ Course saved with banner:', course.banner);

    res.json({
      success: true,
      message: 'Banner uploaded successfully',
      data: {
        banner: course.banner
      }
    });
  } catch (error) {
    console.error('Upload banner error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error uploading banner'
    });
  }
});

// @desc    Enroll in course
// @route   POST /api/courses/:id/enroll
// @access  Private (Student only)
router.post('/:id/enroll', [
  protect,
  authorize('student', 'admin')
], async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    if (!course.isPublished) {
      return res.status(400).json({
        success: false,
        message: 'Course is not available for enrollment'
      });
    }

    // Check if already enrolled
    const isEnrolled = course.enrolledStudents.some(
      enrollment => enrollment.student.toString() === req.user._id.toString()
    );

    if (isEnrolled) {
      return res.status(400).json({
        success: false,
        message: 'Already enrolled in this course'
      });
    }

    // Enroll student
    console.log('📚 Enrolling student:', req.user.email, 'in course:', course.title);
    await course.enrollStudent(req.user._id);

    // Update user's enrolled courses
    const updatedUser = await User.findByIdAndUpdate(req.user._id, {
      $push: { enrolledCourses: course._id }
    }, { new: true });
    
    console.log('✅ Student enrolled successfully. User enrolledCourses count:', updatedUser.enrolledCourses.length);

    // Notify course instructor
    try {
      const notif = await Notification.create({
        userId: course.instructor,
        actorId: req.user._id,
        type: 'enrollment',
        title: 'New enrollment',
        body: `${req.user.firstName || 'A student'} enrolled in ${course.title}`,
        link: `/tutor/courses/${course._id}`,
        courseId: course._id
      });
      emitToUser(course.instructor.toString(), 'notification:new', {
        title: notif.title,
        body: notif.body,
        link: notif.link,
        courseId: course._id
      });
    } catch (e) {
      console.error('Notify instructor enrollment error:', e);
    }

    res.json({
      success: true,
      message: 'Successfully enrolled in course',
      data: { course: course._id }
    });
  } catch (error) {
    console.error('Enroll course error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error enrolling in course'
    });
  }
});

// @desc    Unenroll from course
// @route   DELETE /api/courses/:id/enroll
// @access  Private (Student only)
router.delete('/:id/enroll', [
  protect,
  authorize('student', 'admin')
], async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Unenroll student
    await course.unenrollStudent(req.user._id);

    // Update user's enrolled courses
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { enrolledCourses: course._id }
    });

    res.json({
      success: true,
      message: 'Successfully unenrolled from course'
    });
  } catch (error) {
    console.error('Unenroll course error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error unenrolling from course'
    });
  }
});

// @desc    Get course analytics
// @route   GET /api/courses/:id/analytics
// @access  Private (Course instructor or admin)
router.get('/:id/analytics', protect, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('enrolledStudents.student', 'firstName lastName email lastLogin');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user is the instructor or admin
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view course analytics'
      });
    }

    // Calculate analytics
    const analytics = {
      totalEnrollments: course.enrolledStudents.length,
      completionRate: course.completionPercentage,
      averageProgress: Math.round(
        course.enrolledStudents.reduce((sum, enrollment) => sum + enrollment.progress, 0) /
        course.enrolledStudents.length || 0
      ),
      recentEnrollments: course.enrolledStudents
        .filter(enrollment => {
          const enrollmentDate = new Date(enrollment.enrolledAt);
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return enrollmentDate > weekAgo;
        }).length,
      activeStudents: course.enrolledStudents.filter(enrollment => {
        const lastAccess = new Date(enrollment.lastAccessed);
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return lastAccess > weekAgo;
      }).length
    };

    res.json({
      success: true,
      data: { analytics }
    });
  } catch (error) {
    console.error('Get course analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching course analytics'
    });
  }
});

// @desc    Track time spent by enrolled student
// @route   POST /api/courses/:id/track
// @access  Private (Student)
router.post('/:id/track', [
  protect,
  authorize('student', 'admin'),
  vbody('moduleId').optional().isMongoId(),
  vbody('seconds').isInt({ min: 1, max: 600 }).withMessage('seconds must be between 1 and 600')
], async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    const enrollment = course.enrolledStudents.find(e => e.student.toString() === req.user._id.toString());
    if (!enrollment) return res.status(403).json({ success: false, message: 'Not enrolled' });

    const seconds = parseInt(req.body.seconds || 0);
    enrollment.totalTimeSeconds = (enrollment.totalTimeSeconds || 0) + seconds;
    enrollment.lastAccessed = new Date();
    // Optional: per-module time aggregation
    if (req.body.moduleId) {
      enrollment.moduleTime = enrollment.moduleTime || {};
      const key = req.body.moduleId.toString();
      enrollment.moduleTime.set ? enrollment.moduleTime.set(key, (enrollment.moduleTime.get(key) || 0) + seconds) : (enrollment.moduleTime[key] = (enrollment.moduleTime[key] || 0) + seconds);
    }
    await course.save();
    res.json({ success: true });
  } catch (e) {
    console.error('Track time error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @swagger
 * /courses/{id}:
 *   delete:
 *     summary: Delete a course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Course deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Course not found
 */
router.delete('/:id', protect, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user is the instructor or admin
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this course'
      });
    }

    await Course.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Course deleted successfully'
    });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting course'
    });
  }
});

// @desc    Publish course
// @route   PATCH /api/courses/:id/publish
// @access  Private (Tutor only)
router.patch('/:id/publish', [
  protect,
  authorize('tutor', 'admin')
], async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user is the instructor or admin
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to publish this course'
      });
    }

    // Publish the course
    course.isPublished = true;
    await course.save();

    // Auto-publish all modules and assignments
    console.log('🚀 Course published, auto-publishing modules and assignments...');
    
    try {
      // Import models
      const Module = require('../models/Module');
      const Assignment = require('../models/Assignment');
      
      // Publish all modules in this course
      const modulesResult = await Module.updateMany(
        { courseId: req.params.id },
        { isPublished: true }
      );
      console.log(`📚 Published ${modulesResult.modifiedCount} modules`);
      
      // Publish all assignments in this course
      const assignmentsResult = await Assignment.updateMany(
        { courseId: req.params.id },
        { isPublished: true }
      );
      console.log(`📝 Published ${assignmentsResult.modifiedCount} assignments`);
      
      console.log('✅ Auto-publish completed successfully');
    } catch (autoPublishError) {
      console.error('⚠️ Auto-publish failed:', autoPublishError);
      // Don't fail the course publish if auto-publish fails
    }

    res.json({
      success: true,
      message: 'Course published successfully',
      data: { course }
    });
  } catch (error) {
    console.error('Publish course error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error publishing course'
    });
  }
});

module.exports = router;
