const express = require('express');
const { body, validationResult } = require('express-validator');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /messages/conversations:
 *   get:
 *     summary: Get list of conversations for current user
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of conversations
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
 *                     conversations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           last:
 *                             type: string
 *                             format: date-time
 *                           user:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                               firstName:
 *                                 type: string
 *                               lastName:
 *                                 type: string
 *                               email:
 *                                 type: string
 *                               avatar:
 *                                 type: string
 *                               role:
 *                                 type: string
 */
// List conversations (distinct users this user has messages with)
router.get('/conversations', protect, async (req, res) => {
  try {
    console.log('💬 Fetching conversations for user:', req.user.email);
    
    const convos = await Message.aggregate([
      { $match: { $or: [{ from: req.user._id }, { to: req.user._id }] } },
      { $project: { other: { $cond: [{ $eq: ['$from', req.user._id] }, '$to', '$from'] }, createdAt: 1 } },
      { $group: { _id: '$other', last: { $max: '$createdAt' } } },
      { $sort: { last: -1 } },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 1,
          last: 1,
          user: {
            _id: '$user._id',
            firstName: '$user.firstName',
            lastName: '$user.lastName',
            email: '$user.email',
            avatar: '$user.avatar',
            role: '$user.role'
          }
        }
      }
    ]);
    
    console.log('💬 Found conversations:', convos.length);
    res.json({ success: true, data: { conversations: convos } });
  } catch (e) {
    console.error('❌ List conversations error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @swagger
 * /messages/with/{userId}:
 *   get:
 *     summary: Get messages with a specific user
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to get messages with
 *     responses:
 *       200:
 *         description: List of messages
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
 *                     messages:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           from:
 *                             $ref: '#/components/schemas/User'
 *                           to:
 *                             $ref: '#/components/schemas/User'
 *                           content:
 *                             type: string
 *                           readAt:
 *                             type: string
 *                             format: date-time
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 */
// List messages with a user
router.get('/with/:userId', protect, async (req, res) => {
  try {
    console.log('💬 Fetching messages between', req.user.email, 'and user:', req.params.userId);
    
    const msgs = await Message.find({
      $or: [
        { from: req.user._id, to: req.params.userId },
        { from: req.params.userId, to: req.user._id }
      ]
    })
    .populate('from', 'firstName lastName email avatar role')
    .populate('to', 'firstName lastName email avatar role')
    .sort({ createdAt: 1 });
    
    console.log('💬 Found messages:', msgs.length);
    res.json({ success: true, data: { messages: msgs } });
  } catch (e) {
    console.error('❌ List messages error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @swagger
 * /messages:
 *   post:
 *     summary: Send a message to another user
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - content
 *             properties:
 *               to:
 *                 type: string
 *                 description: User ID of the recipient
 *               content:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 5000
 *                 description: Message content
 *     responses:
 *       201:
 *         description: Message sent successfully
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
 *                     message:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         from:
 *                           type: string
 *                         to:
 *                           type: string
 *                         content:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *       404:
 *         description: Recipient not found
 *       400:
 *         description: Validation error
 */
// Send message
router.post('/', [protect, body('to').isMongoId(), body('content').isLength({ min: 1, max: 5000 })], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    
    const { to, content } = req.body;
    
    // Check if recipient exists
    const recipient = await User.findById(to);
    if (!recipient) {
      return res.status(404).json({ success: false, message: 'Recipient not found' });
    }
    
    // Create the message
    const msg = await Message.create({ 
      from: req.user._id, 
      to: to, 
      content: content 
    });
    
    // Create notification for the recipient
    console.log('💬 Creating message notification for recipient:', recipient.email, 'from:', req.user.email);
    await Notification.create({
      userId: to,
      actorId: req.user._id,
      type: 'system',
      title: 'New message',
      body: `${req.user.firstName || 'Someone'} sent you a message: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
      link: `/messages/with/${req.user._id}`,
      metadata: {
        messageId: msg._id,
        conversationWith: req.user._id
      }
    });

    // Email notifications disabled for performance
    // Send email notification to recipient
    // try {
    //   const { sendEmail } = require('../utils/email');
    //   const messageEmail = {
    //     to: recipient.email,
    //     subject: `New message from ${req.user.firstName || 'Someone'}`,
    //     html: `
    //       <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    //         <h2 style="color: #2c3e50;">💬 New Message</h2>
    //         <p><strong>From:</strong> ${req.user.firstName || 'Someone'} ${req.user.lastName || ''}</p>
    //         <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
    //           <p style="margin: 0; font-style: italic;">"${content}"</p>
    //         </div>
    //         <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/messages/with/${req.user._id}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reply to Message</a></p>
    //       </div>
    //     `,
    //     text: `New message from ${req.user.firstName || 'Someone'}:\n\n"${content}"\n\nReply at: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/messages/with/${req.user._id}`
    //   };
    //   await sendEmail(messageEmail.to, messageEmail.subject, messageEmail.html);
    //   console.log('📧 Email notification sent to:', recipient.email);
    // } catch (e) {
    //   console.warn('Email message notification failed:', e.message);
    // }
    
    console.log('✅ Message sent successfully from', req.user.email, 'to', recipient.email);
    res.status(201).json({ success: true, data: { message: msg } });
  } catch (e) {
    console.error('❌ Send message error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;


