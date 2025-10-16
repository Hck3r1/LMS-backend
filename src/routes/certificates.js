const express = require('express');
const PDFDocument = require('pdfkit');
const { protect } = require('../middleware/auth');
const Course = require('../models/Course');

const router = express.Router();

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
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);
    doc.fontSize(24).text('Certificate of Completion', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).text(`This certifies that`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(22).text(`${req.user.firstName || ''} ${req.user.lastName || ''}`, { align: 'center', underline: true });
    doc.moveDown();
    doc.fontSize(16).text(`has successfully completed the course`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(20).text(`${course.title}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Instructor: ${course.instructor?.firstName || ''} ${course.instructor?.lastName || ''}`, { align: 'center' });
    doc.moveDown(2);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.end();
  } catch (e) {
    console.error('Certificate error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;


