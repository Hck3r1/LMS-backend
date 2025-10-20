const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: [true, 'Course ID is required']
  },
  title: {
    type: String,
    required: [true, 'Module title is required'],
    trim: true,
    maxlength: [100, 'Module title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Module description is required'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  order: {
    type: Number,
    required: [true, 'Module order is required'],
    min: [1, 'Order must be at least 1']
  },
  content: [{
    type: {
      type: String,
      enum: ['video', 'pdf', 'text', 'assignment', 'quiz', 'link', 'image'],
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    url: {
      type: String,
      required: function() {
        return ['video', 'pdf', 'link', 'image'].includes(this.type);
      }
    },
    content: {
      type: String,
      required: function() {
        return this.type === 'text';
      }
    },
    duration: {
      type: Number, // in minutes
      default: 0
    },
    isRequired: {
      type: Boolean,
      default: true
    },
    isPreview: {
      type: Boolean,
      default: false
    },
    order: {
      type: Number,
      default: 0
    },
    // For video content
    videoType: {
      type: String,
      enum: ['youtube', 'vimeo', 'uploaded', 'external'],
      default: 'uploaded'
    },
    // For assignments
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment'
    },
    // For quizzes
    quizData: {
      questions: [{
        question: String,
        options: [String],
        correctAnswer: Number,
        explanation: String
      }],
      timeLimit: Number, // in minutes
      passingScore: Number, // percentage
      attempts: Number,
      allowReview: Boolean
    },
    // File metadata
    fileSize: Number,
    fileType: String,
    thumbnail: String
  }],
  assignments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assignment'
  }],
  prerequisites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module'
  }],
  learningObjectives: [{
    type: String,
    trim: true
  }],
  resources: [{
    title: String,
    url: String,
    type: {
      type: String,
      enum: ['document', 'link', 'video', 'tool']
    },
    description: String
  }],
  estimatedTime: {
    type: Number, // in minutes
    default: 0
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  completionCriteria: {
    type: {
      type: String,
      enum: ['all_content', 'required_content', 'assignments', 'quiz'],
      default: 'all_content'
    },
    passingScore: {
      type: Number,
      default: 70,
      min: 0,
      max: 100
    }
  },
  // Analytics
  views: {
    type: Number,
    default: 0
  },
  completions: {
    type: Number,
    default: 0
  },
  averageTimeSpent: {
    type: Number,
    default: 0
  },
  // Discussion
  allowDiscussion: {
    type: Boolean,
    default: true
  },
  discussionEnabled: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for total content duration
moduleSchema.virtual('totalDuration').get(function() {
  const items = Array.isArray(this.content) ? this.content : [];
  return items.reduce((total, item) => total + (item.duration || 0), 0);
});

// Virtual for required content count
moduleSchema.virtual('requiredContentCount').get(function() {
  const items = Array.isArray(this.content) ? this.content : [];
  return items.filter(item => item.isRequired).length;
});

// Virtual for completion rate
moduleSchema.virtual('completionRate').get(function() {
  if (this.views === 0) return 0;
  return Math.round((this.completions / this.views) * 100);
});

// Indexes for better performance
moduleSchema.index({ courseId: 1, order: 1 });
moduleSchema.index({ isPublished: 1 });
moduleSchema.index({ title: 'text', description: 'text' });

// Compound index for course modules ordering
moduleSchema.index({ courseId: 1, order: 1 }, { unique: true });

// Middleware to update course module count
moduleSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('isPublished')) {
    const Course = mongoose.model('Course');
    await Course.findByIdAndUpdate(this.courseId, {
      $inc: { totalModules: this.isPublished ? 1 : -1 }
    });
  }
  next();
});

// Method to add content to module
moduleSchema.methods.addContent = function(contentData) {
  const maxOrder = this.content.length > 0 ? Math.max(...this.content.map(c => c.order)) : 0;
  contentData.order = maxOrder + 1;
  this.content.push(contentData);
  return this.save();
};

// Method to reorder content
moduleSchema.methods.reorderContent = function(contentIds) {
  contentIds.forEach((contentId, index) => {
    const content = this.content.id(contentId);
    if (content) {
      content.order = index + 1;
    }
  });
  return this.save();
};

// Method to mark content as completed
moduleSchema.methods.markContentCompleted = function(contentId, userId) {
  // This would typically be tracked in a separate UserProgress model
  // For now, we'll just update the views
  this.views += 1;
  return this.save();
};

// Method to complete module
moduleSchema.methods.completeModule = function(userId) {
  this.completions += 1;
  return this.save();
};

// Static method to get module with content
moduleSchema.statics.getModuleWithContent = function(moduleId) {
  return this.findById(moduleId)
    .populate('courseId', 'title instructor')
    .populate('assignments', 'title dueDate maxPoints')
    .populate('prerequisites', 'title order');
};

module.exports = mongoose.model('Module', moduleSchema);
