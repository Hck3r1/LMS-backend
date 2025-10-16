const mongoose = require('mongoose');

const ForumPostSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, trim: true, maxlength: 5000 },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const ForumThreadSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  posts: { type: [ForumPostSchema], default: [] },
  isLocked: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('ForumThread', ForumThreadSchema);


