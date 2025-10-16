const mongoose = require('mongoose');

const AchievementSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  type: { type: String, enum: ['course_complete'], required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  awardedAt: { type: Date, default: Date.now }
}, { timestamps: true });

AchievementSchema.index({ userId: 1, courseId: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('Achievement', AchievementSchema);


