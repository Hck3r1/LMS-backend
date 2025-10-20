const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module',
    required: [true, 'Module ID is required']
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: [true, 'Course ID is required']
  },
  title: {
    type: String,
    required: [true, 'Assignment title is required'],
    trim: true,
    maxlength: [100, 'Assignment title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Assignment description is required'],
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  instructions: {
    type: String,
    required: [true, 'Assignment instructions are required'],
    maxlength: [5000, 'Instructions cannot exceed 5000 characters']
  },
  type: {
    type: String,
    enum: ['file_upload', 'text_submission', 'code_submission', 'quiz', 'project'],
    required: [true, 'Assignment type is required'],
    default: 'file_upload'
  },
  dueDate: {
    type: Date,
    required: [true, 'Due date is required']
  },
  maxPoints: {
    type: Number,
    required: [true, 'Maximum points is required'],
    min: [1, 'Points must be at least 1'],
    max: [1000, 'Points cannot exceed 1000']
  },
  weight: {
    type: Number,
    default: 1,
    min: [0, 'Weight cannot be negative'],
    max: [10, 'Weight cannot exceed 10']
  },
  attachments: [{
    filename: String,
    url: String,
    fileType: String,
    fileSize: Number,
    description: String
  }],
  rubric: [{
    criterion: {
      type: String,
      required: true
    },
    description: String,
    maxPoints: {
      type: Number,
      required: true
    },
    levels: [{
      description: String,
      points: Number
    }]
  }],
  allowedFileTypes: [{
    type: String,
    enum: ['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'gif', 'zip', 'rar', 'mp4', 'avi', 'mov']
  }],
  maxFileSize: {
    type: Number, // in MB
    default: 10
  },
  maxSubmissions: {
    type: Number,
    default: 3,
    min: [1, 'Must allow at least 1 submission']
  },
  allowLateSubmission: {
    type: Boolean,
    default: false
  },
  latePenalty: {
    type: Number,
    default: 0,
    min: [0, 'Late penalty cannot be negative'],
    max: [100, 'Late penalty cannot exceed 100%']
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  submissions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Submission'
  }],
  // For code assignments
  codeTemplate: {
    language: String,
    starterCode: String,
    testCases: [{
      input: String,
      expectedOutput: String,
      points: Number
    }],
    timeLimit: Number, // in seconds
    memoryLimit: Number // in MB
  },
  // For quiz assignments
  quizQuestions: [{
    question: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['multiple_choice', 'true_false', 'short_answer', 'essay'],
      default: 'multiple_choice'
    },
    options: [String],
    correctAnswer: mongoose.Schema.Types.Mixed,
    points: {
      type: Number,
      default: 1
    },
    explanation: String,
    isRequired: {
      type: Boolean,
      default: true
    }
  }],
  // Settings
  allowResubmission: {
    type: Boolean,
    default: true
  },
  autoGrade: {
    type: Boolean,
    default: false
  },
  showRubric: {
    type: Boolean,
    default: true
  },
  allowDiscussion: {
    type: Boolean,
    default: true
  },
  // Analytics
  totalSubmissions: {
    type: Number,
    default: 0
  },
  averageScore: {
    type: Number,
    default: 0
  },
  completionRate: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for submission count
assignmentSchema.virtual('submissionCount').get(function() {
  return this.submissions.length;
});

// Virtual for days until due
assignmentSchema.virtual('daysUntilDue').get(function() {
  const now = new Date();
  const due = new Date(this.dueDate);
  const diffTime = due - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for is overdue
assignmentSchema.virtual('isOverdue').get(function() {
  return new Date() > new Date(this.dueDate);
});

// Indexes for better performance
assignmentSchema.index({ moduleId: 1 });
assignmentSchema.index({ courseId: 1 });
assignmentSchema.index({ dueDate: 1 });
assignmentSchema.index({ isPublished: 1 });
assignmentSchema.index({ type: 1 });

// Middleware to update course assignment count
assignmentSchema.pre('save', async function(next) {
  try {
    if (this.isNew || this.isModified('isPublished') || this.isModified('courseId')) {
      const Course = mongoose.model('Course');
      const Assignment = mongoose.model('Assignment');
      const count = await Assignment.countDocuments({ courseId: this.courseId, isPublished: true });
      await Course.findByIdAndUpdate(this.courseId, { totalAssignments: Math.max(0, count) });
    }
    next();
  } catch (e) {
    next(e);
  }
});

// Method to calculate average score
assignmentSchema.methods.calculateAverageScore = async function() {
  const Submission = mongoose.model('Submission');
  const submissions = await Submission.find({
    assignmentId: this._id,
    status: 'graded'
  });
  
  if (submissions.length === 0) {
    this.averageScore = 0;
  } else {
    const totalScore = submissions.reduce((sum, sub) => sum + sub.grade, 0);
    this.averageScore = Math.round((totalScore / submissions.length) * 100) / 100;
  }
  
  return this.save();
};

// Method to get assignment statistics
assignmentSchema.methods.getStatistics = async function() {
  const Submission = mongoose.model('Submission');
  const stats = await Submission.aggregate([
    { $match: { assignmentId: this._id } },
    {
      $group: {
        _id: null,
        totalSubmissions: { $sum: 1 },
        gradedSubmissions: {
          $sum: { $cond: [{ $eq: ['$status', 'graded'] }, 1, 0] }
        },
        averageGrade: { $avg: '$grade' },
        highestGrade: { $max: '$grade' },
        lowestGrade: { $min: '$grade' }
      }
    }
  ]);
  
  return stats[0] || {
    totalSubmissions: 0,
    gradedSubmissions: 0,
    averageGrade: 0,
    highestGrade: 0,
    lowestGrade: 0
  };
};

// Method to check if student can submit
assignmentSchema.methods.canStudentSubmit = function(studentId) {
  if (!this.isPublished) return false;
  if (new Date() > new Date(this.dueDate) && !this.allowLateSubmission) return false;
  
  // Check submission count limit
  // This would typically be done by checking the Submission model
  return true;
};

// Static method to get assignments for a module
assignmentSchema.statics.getModuleAssignments = function(moduleId) {
  return this.find({ moduleId, isPublished: true })
    .sort({ dueDate: 1 })
    .populate('moduleId', 'title')
    .populate('courseId', 'title');
};

// Static method to get overdue assignments
assignmentSchema.statics.getOverdueAssignments = function() {
  return this.find({
    dueDate: { $lt: new Date() },
    isPublished: true
  }).populate('moduleId', 'title courseId')
    .populate('courseId', 'title');
};

module.exports = mongoose.model('Assignment', assignmentSchema);
