const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['system', 'course', 'module', 'assignment', 'grade', 'enrollment', 'announcement'], required: true },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  link: { type: String, default: '' },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  moduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Module' },
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
  readAt: { type: Date, default: null, index: true },
  seenAt: { type: Date, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed },
}, {
  timestamps: true,
});

notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);


