const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { uploadAvatar, uploadToCloudinary } = require('../middleware/upload');
const authController = require('../controllers/authController');

const router = express.Router();

// Validation rules

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - password
 *             properties:
 *               firstName:
 *                 type: string
 *                 minLength: 2
 *               lastName:
 *                 type: string
 *                 minLength: 2
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               role:
 *                 type: string
 *                 enum: [student, tutor]
 *                 default: student
 *               specialization:
 *                 type: string
 *                 enum: [web-development, ui-ux, data-science, video-editing, graphics-design]
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     token:
 *                       type: string
 *       400:
 *         description: Validation error or user already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/register', [
  body('firstName').trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
  body('lastName').trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional({ checkFalsy: true }).isIn(['student', 'tutor']).withMessage('Role must be student or tutor'),
  body('specialization')
    .optional({ checkFalsy: true })
    .isIn(['web-development', 'ui-ux', 'data-science', 'video-editing', 'graphics-design'])
    .withMessage('Invalid specialization')
], authController.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login a user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     token:
 *                       type: string
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], authController.login);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current authenticated user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 */
router.get('/me', protect, authController.getMe);

/**
 * @swagger
 * /auth/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               bio: { type: string }
 *               skills: { type: array, items: { type: string } }
 *               specialization: { type: string, enum: [web-development, ui-ux, data-science, video-editing, graphics-design] }
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         description: Unauthorized
 */
router.put('/profile', [
  protect,
  body('firstName').optional().trim().isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
  body('lastName').optional().trim().isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
  body('bio').optional().isLength({ max: 500 }).withMessage('Bio cannot exceed 500 characters'),
  body('skills').optional().isArray().withMessage('Skills must be an array'),
  body('specialization').optional().isIn(['web-development', 'ui-ux', 'data-science', 'video-editing', 'graphics-design']).withMessage('Invalid specialization')
], authController.updateProfile);

/**
 * @swagger
 * /auth/avatar:
 *   post:
 *     summary: Upload user avatar
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Avatar uploaded
 *       400:
 *         description: No file uploaded
 */
router.post('/avatar', protect, uploadAvatar, async (req, res) => {
  try {
    if (!req.uploadedFile) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Delete old avatar if exists
    const user = await User.findById(req.user._id);
    if (user.avatar && user.avatar.includes('cloudinary')) {
      const publicId = user.avatar.split('/').pop().split('.')[0];
      await require('../middleware/upload').deleteFromCloudinary(publicId);
    }

    // Update user avatar
    user.avatar = req.uploadedFile.url;
    await user.save();

    res.json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: {
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error uploading avatar'
    });
  }
});

/**
 * @swagger
 * /auth/change-password:
 *   put:
 *     summary: Change current user's password
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 6 }
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Validation or password mismatch
 */
router.put('/change-password', [
  protect,
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');

    // Check current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error changing password'
    });
  }
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user (client removes token)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post('/logout', protect, (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * @swagger
 * /auth/account:
 *   delete:
 *     summary: Delete current user's account
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deleted successfully
 */
router.delete('/account', protect, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    
    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting account'
    });
  }
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh JWT token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *       401:
 *         description: Invalid or expired token
 */
router.post('/refresh', protect, async (req, res) => {
  try {
    console.log('🔄 Token refresh requested for user:', req.user.email);
    
    // Generate new token
    const newToken = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE || '7d'
    });

    console.log('✅ Token refreshed successfully for user:', req.user.email);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: newToken
      }
    });
  } catch (error) {
    console.error('❌ Token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error refreshing token'
    });
  }
});

/**
 * @swagger
 * /auth/check-token:
 *   get:
 *     summary: Check if current token is valid
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
 *       401:
 *         description: Token is invalid or expired
 */
router.get('/check-token', protect, async (req, res) => {
  try {
    console.log('🔍 Token check requested for user:', req.user.email);
    
    res.json({
      success: true,
      message: 'Token is valid',
      data: {
        user: {
          id: req.user._id,
          email: req.user.email,
          role: req.user.role,
          isActive: req.user.isActive
        }
      }
    });
  } catch (error) {
    console.error('❌ Token check error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error checking token'
    });
  }
});

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Password reset email sent
 *       404:
 *         description: User not found
 */
// Test email endpoint (for debugging)
router.post('/test-email', async (req, res) => {
  try {
    const { sendEmail } = require('../utils/email');
    const testEmail = {
      to: req.body.email || 'test@example.com',
      subject: 'Test Email - MIC LMS',
      html: '<h1>Test Email</h1><p>This is a test email from MIC LMS.</p>',
      text: 'Test Email\n\nThis is a test email from MIC LMS.'
    };

    const result = await sendEmail(testEmail);
    
    res.json({
      success: result.success,
      message: result.success ? 'Test email sent successfully' : 'Test email failed',
      details: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Test email error',
      error: error.message
    });
  }
});

router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this email address'
      });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { id: user._id, purpose: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Save reset token to user (you might want to add a resetToken field to User model)
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send password reset email
    let emailSent = false;
    try {
      const { sendEmail } = require('../utils/email');
      const resetEmail = {
        to: user.email,
        subject: 'Password Reset Request - MIC LMS',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">🔐 Password Reset Request</h2>
            <p>Hello ${user.firstName || 'User'},</p>
            <p>You have requested to reset your password for your MIC LMS account.</p>
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Account:</strong> ${user.email}</p>
              <p style="margin: 10px 0 0 0;"><strong>Requested:</strong> ${new Date().toLocaleString()}</p>
            </div>
            <p>Click the button below to reset your password. This link will expire in 1 hour.</p>
            <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}" style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a></p>
            <p style="color: #6c757d; font-size: 14px; margin-top: 30px;">If you didn't request this password reset, please ignore this email.</p>
            <p style="color: #6c757d; font-size: 14px;">This link will expire in 1 hour for security reasons.</p>
          </div>
        `,
        text: `Password Reset Request - MIC LMS\n\nHello ${user.firstName || 'User'},\n\nYou have requested to reset your password for your MIC LMS account.\n\nAccount: ${user.email}\nRequested: ${new Date().toLocaleString()}\n\nClick the link below to reset your password:\n${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}\n\nThis link will expire in 1 hour for security reasons.\n\nIf you didn't request this password reset, please ignore this email.`
      };

      const emailResult = await sendEmail(resetEmail);
      if (emailResult.success) {
        emailSent = true;
        console.log('📧 Password reset email sent to:', user.email);
      } else {
        console.error('📧 Email sending failed:', emailResult.error);
      }
    } catch (emailError) {
      console.error('📧 Email sending failed:', emailError.message);
    }

    res.json({
      success: true,
      message: emailSent 
        ? 'Password reset email sent successfully' 
        : 'Password reset token generated. Please check your email or contact support if you don\'t receive it.',
      emailSent,
      resetToken: emailSent ? undefined : resetToken // Include token if email failed (for development/testing)
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error processing password reset request'
    });
  }
});

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password with token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid or expired token
 */
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { token, newPassword } = req.body;

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Check if token is for password reset
    if (decoded.purpose !== 'password-reset') {
      return res.status(400).json({
        success: false,
        message: 'Invalid token type'
      });
    }

    // Find user and check token
    const user = await User.findOne({
      _id: decoded.id,
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Update password
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Send confirmation email
    try {
      const { sendEmail } = require('../utils/email');
      const confirmationEmail = {
        to: user.email,
        subject: 'Password Reset Successful - MIC LMS',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">✅ Password Reset Successful</h2>
            <p>Hello ${user.firstName || 'User'},</p>
            <p>Your password has been successfully reset for your MIC LMS account.</p>
            <div style="background-color: #e8f5e8; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745;">
              <p style="margin: 0; color: #155724;"><strong>Password reset completed successfully!</strong></p>
            </div>
            <p>You can now log in with your new password.</p>
            <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Login to Your Account</a></p>
            <p style="color: #6c757d; font-size: 14px; margin-top: 30px;">If you didn't make this change, please contact support immediately.</p>
          </div>
        `,
        text: `Password Reset Successful - MIC LMS\n\nHello ${user.firstName || 'User'},\n\nYour password has been successfully reset for your MIC LMS account.\n\nPassword reset completed successfully!\n\nYou can now log in with your new password.\n\nLogin at: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/login\n\nIf you didn't make this change, please contact support immediately.`
      };

      await sendEmail(confirmationEmail);
      console.log('📧 Password reset confirmation sent to:', user.email);
    } catch (emailError) {
      console.error('Confirmation email failed:', emailError);
      // Don't fail the request if email fails
    }

    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error resetting password'
    });
  }
});

/**
 * @swagger
 * /auth/verify-reset-token:
 *   post:
 *     summary: Verify reset token validity
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token is valid
 *       400:
 *         description: Invalid or expired token
 */
router.post('/verify-reset-token', [
  body('token').notEmpty().withMessage('Reset token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { token } = req.body;

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Check if token is for password reset
    if (decoded.purpose !== 'password-reset') {
      return res.status(400).json({
        success: false,
        message: 'Invalid token type'
      });
    }

    // Find user and check token
    const user = await User.findOne({
      _id: decoded.id,
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    res.json({
      success: true,
      message: 'Reset token is valid',
      data: {
        email: user.email,
        firstName: user.firstName
      }
    });
  } catch (error) {
    console.error('Verify reset token error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error verifying reset token'
    });
  }
});

/**
 * @swagger
 * /auth/debug-headers:
 *   get:
 *     summary: Debug request headers (no auth required)
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Headers debug info
 */
router.get('/debug-headers', (req, res) => {
  console.log('🔍 Debug headers request received');
  console.log('🔍 Authorization header:', req.headers.authorization);
  console.log('🔍 All headers:', req.headers);
  
  res.json({
    success: true,
    message: 'Headers debug info',
    data: {
      authorization: req.headers.authorization,
      contentType: req.headers['content-type'],
      userAgent: req.headers['user-agent'],
      allHeaders: req.headers
    }
  });
});

module.exports = router;
