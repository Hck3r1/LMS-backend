const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Course title is required'],
    trim: true,
    maxlength: [100, 'Course title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Course description is required'],
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  shortDescription: {
    type: String,
    maxlength: [200, 'Short description cannot exceed 200 characters']
  },
  category: {
    type: String,
    required: [true, 'Course category is required'],
    enum: ['web-development', 'ui-ux', 'data-science', 'video-editing', 'graphics-design'],
    index: true
  },
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Course instructor is required']
  },
  thumbnail: {
    type: String,
    default: ''
  },
  banner: {
    type: String,
    default: ''
  },
  duration: {
    type: Number, // in hours
    required: [true, 'Course duration is required'],
    min: [1, 'Course duration must be at least 1 hour']
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    required: [true, 'Course difficulty is required'],
    default: 'beginner'
  },
  // Removed pricing for free LMS
  isPublished: {
    type: Boolean,
    default: false
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  modules: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module'
  }],
  enrolledStudents: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    enrolledAt: {
      type: Date,
      default: Date.now
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    completedModules: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Module'
    }],
    lastAccessed: {
      type: Date,
      default: Date.now
    }
  }],
  prerequisites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  }],
  learningObjectives: [{
    type: String,
    trim: true
  }],
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    },
    breakdown: {
      five: { type: Number, default: 0 },
      four: { type: Number, default: 0 },
      three: { type: Number, default: 0 },
      two: { type: Number, default: 0 },
      one: { type: Number, default: 0 }
    }
  },
  reviews: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Review'
  }],
  totalModules: {
    type: Number,
    default: 0
  },
  totalAssignments: {
    type: Number,
    default: 0
  },
  completionRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  language: {
    type: String,
    default: 'English'
  },
  certificateTemplate: {
    type: String,
    default: ''
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for total enrolled students
courseSchema.virtual('enrollmentCount').get(function() {
  return this.enrolledStudents.length;
});

// Virtual for completion percentage
courseSchema.virtual('completionPercentage').get(function() {
  if (this.enrolledStudents.length === 0) return 0;
  const totalProgress = this.enrolledStudents.reduce((sum, enrollment) => sum + enrollment.progress, 0);
  return Math.round(totalProgress / this.enrolledStudents.length);
});

// Indexes for better performance
courseSchema.index({ category: 1, isPublished: 1 });
courseSchema.index({ instructor: 1 });
courseSchema.index({ difficulty: 1 });
courseSchema.index({ 'rating.average': -1 });
courseSchema.index({ createdAt: -1 });
courseSchema.index({ title: 'text', description: 'text', tags: 'text' });

// Middleware to update total modules count
courseSchema.pre('save', function(next) {
  this.totalModules = this.modules.length;
  next();
});

// Method to add student enrollment
courseSchema.methods.enrollStudent = function(studentId) {
  const existingEnrollment = this.enrolledStudents.find(
    enrollment => enrollment.student.toString() === studentId.toString()
  );
  
  if (!existingEnrollment) {
    this.enrolledStudents.push({
      student: studentId,
      enrolledAt: new Date(),
      progress: 0,
      completedModules: [],
      lastAccessed: new Date()
    });
  }
  
  return this.save();
};

// Method to remove student enrollment
courseSchema.methods.unenrollStudent = function(studentId) {
  this.enrolledStudents = this.enrolledStudents.filter(
    enrollment => enrollment.student.toString() !== studentId.toString()
  );
  return this.save();
};

// Method to update student progress
courseSchema.methods.updateStudentProgress = function(studentId, moduleId) {
  const enrollment = this.enrolledStudents.find(
    enrollment => enrollment.student.toString() === studentId.toString()
  );
  
  if (enrollment && !enrollment.completedModules.includes(moduleId)) {
    enrollment.completedModules.push(moduleId);
    enrollment.progress = Math.round((enrollment.completedModules.length / this.totalModules) * 100);
    enrollment.lastAccessed = new Date();
  }
  
  return this.save();
};

// Method to calculate course rating
courseSchema.methods.calculateRating = function() {
  if (this.rating.count === 0) return;
  
  const totalStars = Object.values(this.rating.breakdown).reduce((sum, count) => sum + count, 0);
  if (totalStars > 0) {
    this.rating.average = (
      (this.rating.breakdown.five * 5) +
      (this.rating.breakdown.four * 4) +
      (this.rating.breakdown.three * 3) +
      (this.rating.breakdown.two * 2) +
      (this.rating.breakdown.one * 1)
    ) / totalStars;
  }
};

module.exports = mongoose.model('Course', courseSchema);
