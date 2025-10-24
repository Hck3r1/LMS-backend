const mongoose = require('mongoose');

const certificateRequestSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  courseTitle: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  approvedAt: {
    type: Date
  },
  rejectedAt: {
    type: Date
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReason: {
    type: String
  },
  certificateUrl: {
    type: String
  }
}, {
  timestamps: true
});

// Index for efficient queries
certificateRequestSchema.index({ student: 1, course: 1 });
certificateRequestSchema.index({ status: 1 });
certificateRequestSchema.index({ requestedAt: -1 });

module.exports = mongoose.model('CertificateRequest', certificateRequestSchema);
