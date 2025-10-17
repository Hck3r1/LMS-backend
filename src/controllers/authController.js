const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { firstName, lastName, email, password, role = 'student', specialization } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }

    const userData = { firstName, lastName, email, password, role };
    if ((role === 'tutor' || role === 'admin') && specialization) userData.specialization = specialization;
    const user = await User.create(userData);
    const token = generateToken(user._id);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          specialization: user.specialization,
          avatar: user.avatar,
          isEmailVerified: user.isEmailVerified
        },
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ success: false, message: 'Server error during registration' });
  }
};

exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Login: Validation failed:', errors.array());
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { email, password } = req.body;
    console.log('🔐 Login attempt for email:', email);
    
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      console.log('❌ Login: User not found for email:', email);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    if (!user.isActive) {
      console.log('❌ Login: Account deactivated for email:', email);
      return res.status(401).json({ success: false, message: 'Account has been deactivated' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log('❌ Login: Invalid password for email:', email);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);
    console.log('✅ Login: Successful login for user:', user.email, 'Role:', user.role, 'Token expires in:', process.env.JWT_EXPIRE || '7d');

    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          specialization: user.specialization,
          avatar: user.avatar,
          isEmailVerified: user.isEmailVerified,
          enrollmentDate: user.enrollmentDate,
          profileCompletion: user.profileCompletion
        },
        token
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

exports.getMe = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Fetch without populate first
    const baseUser = await User.findById(req.user._id).select('-password');
    if (!baseUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let enrolledCourses = [];
    let createdCourses = [];
    try {
      // Filter invalid IDs defensively
      const toValidIds = (arr) => (Array.isArray(arr) ? arr.filter(id => typeof id === 'string' || (id && id._id) || /^[a-f\d]{24}$/i.test(String(id))) : []);
      const validEnrolled = toValidIds(baseUser.enrolledCourses);
      const validCreated = toValidIds(baseUser.createdCourses);

      const populated = await User.findById(req.user._id)
        .populate({ path: 'enrolledCourses', select: 'title thumbnail instructor duration difficulty rating', match: { _id: { $in: validEnrolled } } })
        .populate({ path: 'createdCourses', select: 'title thumbnail enrolledStudents rating', match: { _id: { $in: validCreated } } })
        .select('-password');

      enrolledCourses = Array.isArray(populated.enrolledCourses) ? populated.enrolledCourses : [];
      createdCourses = Array.isArray(populated.createdCourses) ? populated.createdCourses : [];
    } catch (e) {
      // Fallback if populate fails
      enrolledCourses = [];
      createdCourses = [];
      console.warn('getMe populate failed, returning minimal user:', e.message);
    }

    const safeUser = {
      id: baseUser._id,
      firstName: baseUser.firstName || '',
      lastName: baseUser.lastName || '',
      email: baseUser.email || '',
      role: baseUser.role || 'student',
      specialization: baseUser.specialization || '',
      avatar: baseUser.avatar || '',
      bio: baseUser.bio || '',
      skills: Array.isArray(baseUser.skills) ? baseUser.skills : [],
      isEmailVerified: !!baseUser.isEmailVerified,
      enrollmentDate: baseUser.enrollmentDate || null,
      lastLogin: baseUser.lastLogin || null,
      profileCompletion: baseUser.profileCompletion || 0,
      enrolledCourses,
      createdCourses,
      rating: baseUser.rating || { average: 0, count: 0 },
      totalStudents: typeof baseUser.totalStudents === 'number' ? baseUser.totalStudents : 0
    };

    return res.json({ success: true, data: { user: safeUser } });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching user data' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const { firstName, lastName, bio, skills, specialization } = req.body;
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (bio !== undefined) updateData.bio = bio;
    if (skills) updateData.skills = skills;
    if (specialization) updateData.specialization = specialization;

    const user = await User.findByIdAndUpdate(req.user._id, updateData, { new: true, runValidators: true });

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          specialization: user.specialization,
          avatar: user.avatar,
          bio: user.bio,
          skills: user.skills,
          profileCompletion: user.profileCompletion
        }
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return res.status(500).json({ success: false, message: 'Server error updating profile' });
  }
};


