const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module',
    required: true
  },
  contentId: {
    type: String, // ID of specific content item within module
    required: false
  },
  status: {
    type: String,
    enum: ['started', 'in_progress', 'completed'],
    default: 'started'
  },
  completionPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  timeSpent: {
    type: Number, // in seconds
    default: 0
  },
  lastAccessed: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    required: false
  },
  // Track which content items have been viewed
  viewedContent: [{
    contentId: String,
    viewedAt: Date,
    timeSpent: Number
  }],
  // Track assignment submissions for this module
  assignmentProgress: [{
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment'
    },
    submitted: {
      type: Boolean,
      default: false
    },
    submittedAt: Date,
    grade: Number,
    maxPoints: Number
  }]
}, {
  timestamps: true
});

// Index for efficient queries
progressSchema.index({ studentId: 1, courseId: 1 });
progressSchema.index({ studentId: 1, moduleId: 1 });
progressSchema.index({ courseId: 1, status: 1 });

// Virtual for module completion status
progressSchema.virtual('isCompleted').get(function() {
  return this.status === 'completed';
});

// Virtual for course completion percentage
progressSchema.virtual('courseProgress').get(function() {
  // This will be calculated at the course level
  return this.completionPercentage;
});

// Method to mark module as completed
progressSchema.methods.markCompleted = function() {
  this.status = 'completed';
  this.completionPercentage = 100;
  this.completedAt = new Date();
  return this.save();
};

// Method to update time spent
progressSchema.methods.updateTimeSpent = function(additionalTime) {
  this.timeSpent += additionalTime;
  this.lastAccessed = new Date();
  return this.save();
};

// Method to mark content as viewed
progressSchema.methods.markContentViewed = function(contentId, timeSpent = 0) {
  const existingView = this.viewedContent.find(v => v.contentId === contentId);
  
  if (existingView) {
    existingView.viewedAt = new Date();
    existingView.timeSpent += timeSpent;
  } else {
    this.viewedContent.push({
      contentId,
      viewedAt: new Date(),
      timeSpent
    });
  }
  
  this.lastAccessed = new Date();
  return this.save();
};

// Static method to get student's progress for a course
progressSchema.statics.getCourseProgress = async function(studentId, courseId) {
  const progress = await this.find({ studentId, courseId })
    .populate('moduleId', 'title order')
    .sort({ 'moduleId.order': 1 });
  
  return progress;
};

// Static method to get student's overall progress
progressSchema.statics.getStudentProgress = async function(studentId) {
  const progress = await this.find({ studentId })
    .populate('courseId', 'title category')
    .populate('moduleId', 'title order')
    .sort({ 'courseId.title': 1, 'moduleId.order': 1 });
  
  return progress;
};

// Static method to mark module as completed
progressSchema.statics.markModuleCompleted = async function(studentId, courseId, moduleId) {
  let progress = await this.findOne({ studentId, courseId, moduleId });
  
  if (!progress) {
    progress = new this({
      studentId,
      courseId,
      moduleId,
      status: 'completed',
      completionPercentage: 100,
      completedAt: new Date()
    });
  } else {
    progress.status = 'completed';
    progress.completionPercentage = 100;
    progress.completedAt = new Date();
  }
  
  return progress.save();
};

module.exports = mongoose.model('Progress', progressSchema);
