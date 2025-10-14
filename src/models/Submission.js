const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assignment',
    required: [true, 'Assignment ID is required']
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Student ID is required']
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: [true, 'Course ID is required']
  },
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module',
    required: [true, 'Module ID is required']
  },
  submissionNumber: {
    type: Number,
    default: 1
  },
  files: [{
    filename: {
      type: String,
      required: true
    },
    originalName: String,
    url: {
      type: String,
      required: true
    },
    fileType: String,
    fileSize: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  textSubmission: {
    type: String,
    maxlength: [10000, 'Text submission cannot exceed 10000 characters']
  },
  codeSubmission: {
    language: String,
    code: String,
    output: String,
    executionTime: Number,
    memoryUsage: Number,
    testResults: [{
      testCase: String,
      expected: String,
      actual: String,
      passed: Boolean,
      points: Number
    }]
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  lastModified: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'graded', 'returned'],
    default: 'submitted'
  },
  grade: {
    type: Number,
    min: [0, 'Grade cannot be negative'],
    max: [100, 'Grade cannot exceed 100']
  },
  maxPoints: {
    type: Number,
    default: 100
  },
  feedback: {
    general: {
      type: String,
      maxlength: [2000, 'General feedback cannot exceed 2000 characters']
    },
    rubric: [{
      criterion: String,
      points: Number,
      maxPoints: Number,
      feedback: String
    }],
    strengths: [String],
    improvements: [String],
    suggestions: [String]
  },
  gradedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  gradedAt: Date,
  isLate: {
    type: Boolean,
    default: false
  },
  latePenalty: {
    type: Number,
    default: 0
  },
  // Peer review (if enabled)
  peerReviews: [{
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    feedback: String,
    submittedAt: Date
  }],
  // Plagiarism detection
  plagiarismScore: {
    type: Number,
    min: 0,
    max: 100
  },
  plagiarismReport: String,
  // Version control
  version: {
    type: Number,
    default: 1
  },
  previousVersions: [{
    version: Number,
    files: [mongoose.Schema.Types.Mixed],
    textSubmission: String,
    submittedAt: Date
  }],
  // Comments and discussions
  comments: [{
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    content: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    isPrivate: {
      type: Boolean,
      default: false
    }
  }],
  // Analytics
  timeSpent: {
    type: Number, // in minutes
    default: 0
  },
  wordCount: {
    type: Number,
    default: 0
  },
  // Notifications
  notifications: [{
    type: {
      type: String,
      enum: ['graded', 'feedback', 'reminder', 'late']
    },
    message: String,
    sentAt: Date,
    read: {
      type: Boolean,
      default: false
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for final grade after late penalty
submissionSchema.virtual('finalGrade').get(function() {
  if (!this.grade) return null;
  
  if (this.isLate && this.latePenalty > 0) {
    const penaltyAmount = (this.grade * this.latePenalty) / 100;
    return Math.max(0, this.grade - penaltyAmount);
  }
  
  return this.grade;
});

// Virtual for grade percentage
submissionSchema.virtual('gradePercentage').get(function() {
  if (!this.grade) return null;
  return Math.round((this.grade / this.maxPoints) * 100);
});

// Virtual for is graded
submissionSchema.virtual('isGraded').get(function() {
  return this.status === 'graded' || this.status === 'returned';
});

// Virtual for days since submission
submissionSchema.virtual('daysSinceSubmission').get(function() {
  const now = new Date();
  const submitted = new Date(this.submittedAt);
  const diffTime = now - submitted;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
});

// Indexes for better performance
submissionSchema.index({ assignmentId: 1, studentId: 1 });
submissionSchema.index({ studentId: 1, submittedAt: -1 });
submissionSchema.index({ courseId: 1 });
submissionSchema.index({ status: 1 });
submissionSchema.index({ gradedBy: 1 });

// Compound index for unique submission per assignment per student
submissionSchema.index({ assignmentId: 1, studentId: 1, submissionNumber: 1 }, { unique: true });

// Middleware to check for late submission
submissionSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('submittedAt')) {
    const Assignment = mongoose.model('Assignment');
    const assignment = await Assignment.findById(this.assignmentId);
    
    if (assignment && new Date(this.submittedAt) > new Date(assignment.dueDate)) {
      this.isLate = true;
      this.latePenalty = assignment.latePenalty;
    }
  }
  
  // Update word count for text submissions
  if (this.textSubmission) {
    this.wordCount = this.textSubmission.split(/\s+/).length;
  }
  
  next();
});

// Method to add feedback
submissionSchema.methods.addFeedback = function(feedbackData, gradedBy) {
  this.feedback = feedbackData;
  this.gradedBy = gradedBy;
  this.gradedAt = new Date();
  this.status = 'graded';
  return this.save();
};

// Method to add comment
submissionSchema.methods.addComment = function(authorId, content, isPrivate = false) {
  this.comments.push({
    author: authorId,
    content,
    isPrivate,
    createdAt: new Date()
  });
  return this.save();
};

// Method to update grade
submissionSchema.methods.updateGrade = function(grade, feedback = null) {
  this.grade = grade;
  if (feedback) {
    this.feedback = feedback;
  }
  this.status = 'graded';
  this.gradedAt = new Date();
  return this.save();
};

// Method to return submission
submissionSchema.methods.returnSubmission = function(feedback) {
  this.feedback = feedback;
  this.status = 'returned';
  this.gradedAt = new Date();
  return this.save();
};

// Method to get peer review average
submissionSchema.methods.getPeerReviewAverage = function() {
  if (this.peerReviews.length === 0) return null;
  
  const totalRating = this.peerReviews.reduce((sum, review) => sum + review.rating, 0);
  return Math.round((totalRating / this.peerReviews.length) * 10) / 10;
};

// Static method to get submissions for assignment
submissionSchema.statics.getAssignmentSubmissions = function(assignmentId) {
  return this.find({ assignmentId })
    .populate('studentId', 'firstName lastName email avatar')
    .populate('gradedBy', 'firstName lastName')
    .sort({ submittedAt: -1 });
};

// Static method to get student submissions
submissionSchema.statics.getStudentSubmissions = function(studentId, courseId = null) {
  const query = { studentId };
  if (courseId) query.courseId = courseId;
  
  return this.find(query)
    .populate('assignmentId', 'title maxPoints dueDate')
    .populate('courseId', 'title')
    .populate('moduleId', 'title')
    .sort({ submittedAt: -1 });
};

// Static method to get ungraded submissions
submissionSchema.statics.getUngradedSubmissions = function() {
  return this.find({
    status: { $in: ['submitted', 'under_review'] }
  }).populate('assignmentId', 'title dueDate')
    .populate('studentId', 'firstName lastName email')
    .populate('courseId', 'title')
    .sort({ submittedAt: 1 });
};

module.exports = mongoose.model('Submission', submissionSchema);
