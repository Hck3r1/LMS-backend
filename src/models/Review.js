const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true, maxlength: 2000 }
}, { timestamps: true });

ReviewSchema.index({ courseId: 1, author: 1 }, { unique: true });

module.exports = mongoose.model('Review', ReviewSchema);


