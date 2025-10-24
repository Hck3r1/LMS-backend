const express = require('express');
const PDFDocument = require('pdfkit');
const { protect, authorize } = require('../middleware/auth');
const Course = require('../models/Course');
const CertificateRequest = require('../models/CertificateRequest');
const User = require('../models/User');

const router = express.Router();

// Simple test certificate
router.get('/test', (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="test-certificate.pdf"');
    
    const doc = new PDFDocument({ size: 'A4' });
    doc.pipe(res);
    
    // Simple text
    doc.fontSize(20).text('Hello World!', 100, 100);
    doc.fontSize(16).text('This is a test certificate.', 100, 150);
    doc.fontSize(14).text('Date: ' + new Date().toLocaleDateString(), 100, 200);
    
    doc.end();
  } catch (error) {
    console.error('Test certificate error:', error);
    res.status(500).json({ success: false, message: 'Server error generating test certificate' });
  }
});

// Sample certificate endpoint (no auth required for demo)
router.get('/sample', (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="sample-certificate.pdf"');
    
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);
    
    // Simple certificate
    doc.fontSize(24).text('Certificate of Completion', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).text('This certifies that', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(22).text('John Doe', { align: 'center', underline: true });
    doc.moveDown();
    doc.fontSize(16).text('has successfully completed the course', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(20).text('Introduction to Web Development', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text('Instructor: Jane Smith', { align: 'center' });
    doc.moveDown(2);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.text('Certificate ID: SAMPLE-12345', { align: 'center' });
    doc.moveDown();
    doc.text('MIC Oyo State Learning Management System', { align: 'center' });
    
    doc.end();
  } catch (error) {
    console.error('Sample certificate error:', error);
    res.status(500).json({ success: false, message: 'Server error generating sample certificate' });
  }
});

// Generate a simple PDF certificate if student completed course
router.get('/:courseId', protect, async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId).populate('instructor', 'firstName lastName');
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    const enr = course.enrolledStudents.find(e => e.student.toString() === req.user._id.toString());
    if (!enr) return res.status(403).json({ success: false, message: 'Not enrolled' });
    if ((enr.progress || 0) < 100) return res.status(400).json({ success: false, message: 'Course not yet completed' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${course._id}.pdf"`);
    
    const doc = new PDFDocument({ 
      size: 'A4', 
      margin: 40,
      info: {
        Title: 'Certificate of Completion',
        Author: 'MIC Oyo State LMS',
        Subject: 'Course Completion Certificate'
      }
    });
    doc.pipe(res);
    
    // Page dimensions
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 40;
    
    // Background gradient effect
    doc.rect(0, 0, pageWidth, pageHeight)
       .fill('#f8fafc');
    
    // Decorative border
    const borderWidth = 8;
    const borderColor = '#3b82f6';
    
    // Outer border
    doc.rect(margin, margin, pageWidth - 2*margin, pageHeight - 2*margin)
       .stroke(borderColor, borderWidth);
    
    // Inner decorative border
    doc.rect(margin + 20, margin + 20, pageWidth - 2*margin - 40, pageHeight - 2*margin - 40)
       .stroke('#1e40af', 2);
    
    // Corner decorations
    const cornerSize = 30;
    const cornerColor = '#3b82f6';
    
    // Top-left corner
    doc.rect(margin + 5, margin + 5, cornerSize, cornerSize)
       .fill(cornerColor);
    
    // Top-right corner
    doc.rect(pageWidth - margin - cornerSize - 5, margin + 5, cornerSize, cornerSize)
       .fill(cornerColor);
    
    // Bottom-left corner
    doc.rect(margin + 5, pageHeight - margin - cornerSize - 5, cornerSize, cornerSize)
       .fill(cornerColor);
    
    // Bottom-right corner
    doc.rect(pageWidth - margin - cornerSize - 5, pageHeight - margin - cornerSize - 5, cornerSize, cornerSize)
       .fill(cornerColor);
    
    // Header section with background
    const headerY = margin + 60;
    const headerHeight = 80;
    
    doc.rect(margin + 30, headerY, pageWidth - 2*margin - 60, headerHeight)
       .fill('#1e40af');
    
    // Certificate title
    doc.fillColor('white')
       .fontSize(32)
       .font('Helvetica-Bold')
       .text('CERTIFICATE OF COMPLETION', margin + 30, headerY + 25, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Subtitle
    doc.fontSize(14)
       .font('Helvetica')
       .text('This is to certify that', margin + 30, headerY + 60, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Main content area
    const contentY = headerY + headerHeight + 40;
    
    // Student name with decorative underline
    doc.fillColor('#1f2937')
       .fontSize(28)
       .font('Helvetica-Bold')
       .text(`${req.user.firstName || ''} ${req.user.lastName || ''}`, margin + 30, contentY, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Decorative line under name
    const lineY = contentY + 35;
    const lineWidth = 200;
    const lineX = (pageWidth - lineWidth) / 2;
    
    doc.strokeColor('#3b82f6')
       .lineWidth(3)
       .moveTo(lineX, lineY)
       .lineTo(lineX + lineWidth, lineY)
       .stroke();
    
    // Course completion text
    doc.fillColor('#374151')
       .fontSize(16)
       .font('Helvetica')
       .text('has successfully completed the course', margin + 30, contentY + 50, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Course title
    doc.fillColor('#1f2937')
       .fontSize(22)
       .font('Helvetica-Bold')
       .text(`${course.title}`, margin + 30, contentY + 80, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Course details section
    const detailsY = contentY + 130;
    
    // Instructor info
    doc.fillColor('#6b7280')
       .fontSize(14)
       .font('Helvetica')
       .text(`Instructor: ${course.instructor?.firstName || ''} ${course.instructor?.lastName || ''}`, margin + 30, detailsY, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Duration info
    doc.text(`Duration: ${course.duration || 'N/A'} hours`, margin + 30, detailsY + 20, {
      width: pageWidth - 2*margin - 60,
      align: 'center'
    });
    
    // Date section
    const dateY = pageHeight - 120;
    
    doc.fillColor('#1f2937')
       .fontSize(14)
       .font('Helvetica-Bold')
       .text(`Date of Completion: ${new Date().toLocaleDateString('en-US', { 
         year: 'numeric', 
         month: 'long', 
         day: 'numeric' 
       })}`, margin + 30, dateY, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Certificate ID
    doc.fillColor('#6b7280')
       .fontSize(12)
       .font('Helvetica')
       .text(`Certificate ID: ${course._id}`, margin + 30, dateY + 25, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Footer with institution info
    const footerY = pageHeight - 60;
    
    doc.fillColor('#374151')
       .fontSize(12)
       .font('Helvetica')
       .text('MIC Oyo State Learning Management System', margin + 30, footerY, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Decorative elements - small circles
    const circleRadius = 8;
    const circleColor = '#3b82f6';
    
    // Top decorative circles
    doc.circle(100, 100, circleRadius).fill(circleColor);
    doc.circle(pageWidth - 100, 100, circleRadius).fill(circleColor);
    
    // Bottom decorative circles
    doc.circle(100, pageHeight - 100, circleRadius).fill(circleColor);
    doc.circle(pageWidth - 100, pageHeight - 100, circleRadius).fill(circleColor);
    
    doc.end();
  } catch (e) {
    console.error('Certificate error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ===== CERTIFICATE REQUEST SYSTEM =====

// Get all certificate requests (for tutors)
router.get('/requests', protect, authorize('tutor', 'admin'), async (req, res) => {
  try {
    const requests = await CertificateRequest.find()
      .populate('student', 'firstName lastName email avatar')
      .populate('course', 'title instructor')
      .populate('approvedBy', 'firstName lastName')
      .sort({ requestedAt: -1 });

    res.json({
      success: true,
      data: requests
    });
  } catch (error) {
    console.error('Error fetching certificate requests:', error);
    res.status(500).json({ success: false, message: 'Server error fetching requests' });
  }
});

// Request a certificate (for students)
router.post('/request', protect, authorize('student', 'admin'), async (req, res) => {
  try {
    const { courseId, courseTitle } = req.body;

    if (!courseId || !courseTitle) {
      return res.status(400).json({
        success: false,
        message: 'Course ID and title are required'
      });
    }

    // Check if student is enrolled and completed the course
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    const enrollment = course.enrolledStudents.find(
      e => e.student.toString() === req.user._id.toString()
    );

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this course'
      });
    }

    if ((enrollment.progress || 0) < 100) {
      return res.status(400).json({
        success: false,
        message: 'Course must be completed before requesting certificate'
      });
    }

    // Check if request already exists
    const existingRequest = await CertificateRequest.findOne({
      student: req.user._id,
      course: courseId
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'Certificate request already exists for this course'
      });
    }

    // Create new certificate request
    const certificateRequest = new CertificateRequest({
      student: req.user._id,
      course: courseId,
      courseTitle: courseTitle
    });

    await certificateRequest.save();

    // Populate the response
    await certificateRequest.populate('student', 'firstName lastName email');
    await certificateRequest.populate('course', 'title instructor');

    res.status(201).json({
      success: true,
      message: 'Certificate request submitted successfully',
      data: certificateRequest
    });
  } catch (error) {
    console.error('Error creating certificate request:', error);
    res.status(500).json({ success: false, message: 'Server error creating request' });
  }
});

// Approve certificate request (for tutors)
router.post('/:requestId/approve', protect, authorize('tutor', 'admin'), async (req, res) => {
  try {
    const request = await CertificateRequest.findById(req.params.requestId)
      .populate('student', 'firstName lastName email')
      .populate('course', 'title instructor');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Certificate request not found'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Request has already been processed'
      });
    }

    // Update request status
    request.status = 'approved';
    request.approvedAt = new Date();
    request.approvedBy = req.user._id;

    await request.save();

    res.json({
      success: true,
      message: 'Certificate request approved successfully',
      data: request
    });
  } catch (error) {
    console.error('Error approving certificate request:', error);
    res.status(500).json({ success: false, message: 'Server error approving request' });
  }
});

// Reject certificate request (for tutors)
router.post('/:requestId/reject', protect, authorize('tutor', 'admin'), async (req, res) => {
  try {
    const { reason } = req.body;

    const request = await CertificateRequest.findById(req.params.requestId)
      .populate('student', 'firstName lastName email')
      .populate('course', 'title instructor');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Certificate request not found'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Request has already been processed'
      });
    }

    // Update request status
    request.status = 'rejected';
    request.rejectedAt = new Date();
    request.rejectionReason = reason || 'No reason provided';

    await request.save();

    res.json({
      success: true,
      message: 'Certificate request rejected',
      data: request
    });
  } catch (error) {
    console.error('Error rejecting certificate request:', error);
    res.status(500).json({ success: false, message: 'Server error rejecting request' });
  }
});

// Get student's certificate requests
router.get('/student/requests', protect, authorize('student', 'admin'), async (req, res) => {
  try {
    const requests = await CertificateRequest.find({ student: req.user._id })
      .populate('course', 'title instructor')
      .populate('approvedBy', 'firstName lastName')
      .sort({ requestedAt: -1 });

    res.json({
      success: true,
      data: requests
    });
  } catch (error) {
    console.error('Error fetching student certificate requests:', error);
    res.status(500).json({ success: false, message: 'Server error fetching requests' });
  }
});

// Download approved certificate
router.get('/download/:requestId', protect, async (req, res) => {
  try {
    const request = await CertificateRequest.findById(req.params.requestId)
      .populate('student', 'firstName lastName')
      .populate('course', 'title instructor');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Certificate request not found'
      });
    }

    // Check if user is authorized to download
    const isStudent = request.student._id.toString() === req.user._id.toString();
    const isTutor = req.user.role === 'tutor' || req.user.role === 'admin';

    if (!isStudent && !isTutor) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to download this certificate'
      });
    }

    if (request.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Certificate has not been approved yet'
      });
    }

    // Generate PDF certificate
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${request.course._id}.pdf"`);
    
    const doc = new PDFDocument({ 
      size: 'A4', 
      margin: 40,
      info: {
        Title: 'Certificate of Completion',
        Author: 'MIC Oyo State LMS',
        Subject: 'Course Completion Certificate'
      }
    });
    doc.pipe(res);
    
    // Page dimensions
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 40;
    
    // Background gradient effect
    doc.rect(0, 0, pageWidth, pageHeight)
       .fill('#f8fafc');
    
    // Decorative border
    const borderWidth = 8;
    const borderColor = '#3b82f6';
    
    // Outer border
    doc.rect(margin, margin, pageWidth - 2*margin, pageHeight - 2*margin)
       .stroke(borderColor, borderWidth);
    
    // Inner decorative border
    doc.rect(margin + 20, margin + 20, pageWidth - 2*margin - 40, pageHeight - 2*margin - 40)
       .stroke('#1e40af', 2);
    
    // Corner decorations
    const cornerSize = 30;
    const cornerColor = '#3b82f6';
    
    // Top-left corner
    doc.rect(margin + 5, margin + 5, cornerSize, cornerSize)
       .fill(cornerColor);
    
    // Top-right corner
    doc.rect(pageWidth - margin - cornerSize - 5, margin + 5, cornerSize, cornerSize)
       .fill(cornerColor);
    
    // Bottom-left corner
    doc.rect(margin + 5, pageHeight - margin - cornerSize - 5, cornerSize, cornerSize)
       .fill(cornerColor);
    
    // Bottom-right corner
    doc.rect(pageWidth - margin - cornerSize - 5, pageHeight - margin - cornerSize - 5, cornerSize, cornerSize)
       .fill(cornerColor);
    
    // Header section with background
    const headerY = margin + 60;
    const headerHeight = 80;
    
    doc.rect(margin + 30, headerY, pageWidth - 2*margin - 60, headerHeight)
       .fill('#1e40af');
    
    // Certificate title
    doc.fillColor('white')
       .fontSize(32)
       .font('Helvetica-Bold')
       .text('CERTIFICATE OF COMPLETION', margin + 30, headerY + 25, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Subtitle
    doc.fontSize(14)
       .font('Helvetica')
       .text('This is to certify that', margin + 30, headerY + 60, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Main content area
    const contentY = headerY + headerHeight + 40;
    
    // Student name with decorative underline
    doc.fillColor('#1f2937')
       .fontSize(28)
       .font('Helvetica-Bold')
       .text(`${request.student.firstName} ${request.student.lastName}`, margin + 30, contentY, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Decorative line under name
    const lineY = contentY + 35;
    const lineWidth = 200;
    const lineX = (pageWidth - lineWidth) / 2;
    
    doc.strokeColor('#3b82f6')
       .lineWidth(3)
       .moveTo(lineX, lineY)
       .lineTo(lineX + lineWidth, lineY)
       .stroke();
    
    // Course completion text
    doc.fillColor('#374151')
       .fontSize(16)
       .font('Helvetica')
       .text('has successfully completed the course', margin + 30, contentY + 50, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Course title
    doc.fillColor('#1f2937')
       .fontSize(22)
       .font('Helvetica-Bold')
       .text(`${request.course.title}`, margin + 30, contentY + 80, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Course details section
    const detailsY = contentY + 130;
    
    // Instructor info
    doc.fillColor('#6b7280')
       .fontSize(14)
       .font('Helvetica')
       .text(`Instructor: ${request.course.instructor?.firstName || ''} ${request.course.instructor?.lastName || ''}`, margin + 30, detailsY, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Duration info
    doc.text(`Duration: ${request.course.duration || 'N/A'} hours`, margin + 30, detailsY + 20, {
      width: pageWidth - 2*margin - 60,
      align: 'center'
    });
    
    // Date section
    const dateY = pageHeight - 120;
    
    doc.fillColor('#1f2937')
       .fontSize(14)
       .font('Helvetica-Bold')
       .text(`Date of Completion: ${new Date().toLocaleDateString('en-US', { 
         year: 'numeric', 
         month: 'long', 
         day: 'numeric' 
       })}`, margin + 30, dateY, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Certificate ID
    doc.fillColor('#6b7280')
       .fontSize(12)
       .font('Helvetica')
       .text(`Certificate ID: ${request._id}`, margin + 30, dateY + 25, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Footer with institution info
    const footerY = pageHeight - 60;
    
    doc.fillColor('#374151')
       .fontSize(12)
       .font('Helvetica')
       .text('MIC Oyo State Learning Management System', margin + 30, footerY, {
         width: pageWidth - 2*margin - 60,
         align: 'center'
       });
    
    // Decorative elements - small circles
    const circleRadius = 8;
    const circleColor = '#3b82f6';
    
    // Top decorative circles
    doc.circle(100, 100, circleRadius).fill(circleColor);
    doc.circle(pageWidth - 100, 100, circleRadius).fill(circleColor);
    
    // Bottom decorative circles
    doc.circle(100, pageHeight - 100, circleRadius).fill(circleColor);
    doc.circle(pageWidth - 100, pageHeight - 100, circleRadius).fill(circleColor);
    
    doc.end();
  } catch (error) {
    console.error('Error downloading certificate:', error);
    res.status(500).json({ success: false, message: 'Server error downloading certificate' });
  }
});

module.exports = router;


