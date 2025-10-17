const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't include password in queries by default
  },
  role: {
    type: String,
    enum: ['student', 'tutor', 'admin'],
    default: 'student'
  },
  avatar: {
    type: String,
    default: ''
  },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: ''
  },
  skills: [{
    type: String,
    trim: true
  }],
  specialization: {
    type: String,
    enum: ['web-development', 'ui-ux', 'data-science', 'video-editing', 'graphics-design', ''],
    default: ''
  },
  enrollmentDate: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
  // Student specific fields
  enrolledCourses: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course'
    }],
    default: []
  },
  completedModules: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Module'
    }],
    default: []
  },
  // Tutor specific fields
  createdCourses: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course'
    }],
    default: []
  },
  rating: {
    average: {
      type: Number,
      default: 0
    },
    count: {
      type: Number,
      default: 0
    }
  },
  totalStudents: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for profile completion percentage
userSchema.virtual('profileCompletion').get(function() {
  let completion = 0;
  const fields = ['firstName', 'lastName', 'email', 'bio', 'avatar'];
  fields.forEach(field => {
    if (this[field] && this[field] !== '') completion += 20;
  });
  return completion;
});

// Index for better performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ specialization: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();

  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Get user's courses (for students)
userSchema.methods.getEnrolledCourses = function() {
  return this.populate('enrolledCourses', 'title thumbnail instructor duration difficulty rating');
};

// Get tutor's created courses
userSchema.methods.getCreatedCourses = function() {
  return this.populate('createdCourses', 'title thumbnail enrolledStudents rating');
};

module.exports = mongoose.model('User', userSchema);
