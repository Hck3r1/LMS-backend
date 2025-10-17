const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Notification = require('../models/Notification');
const UserPreferences = require('../models/UserPreferences');
const { protect } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

const router = express.Router();

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: List notifications for current user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unread
 *         schema: { type: boolean }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100 }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Notifications list
 */
router.get('/', [protect, query('limit').optional().isInt({ min: 1, max: 100 })], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { unread, cursor } = req.query;
    const limit = parseInt(req.query.limit || '20');

    console.log('🔔 Fetching notifications for user:', req.user._id, req.user.email);

    const filter = { userId: req.user._id };
    if (unread === 'true') filter.readAt = null;
    if (cursor) filter._id = { $lt: cursor };

    console.log('🔔 Filter being used:', filter);

    const items = await Notification.find(filter).sort({ _id: -1 }).limit(limit + 1);
    console.log('🔔 Found notifications:', items.length, 'for user:', req.user.email);
    
    // Log first few notification details for debugging
    if (items.length > 0) {
      console.log('🔔 First notification details:', {
        id: items[0]._id,
        userId: items[0].userId,
        title: items[0].title,
        type: items[0].type
      });
    }

    const nextCursor = items.length > limit ? items[limit - 1]?._id : null;
    const data = items.slice(0, limit);

    const unreadCount = await Notification.countDocuments({ userId: req.user._id, readAt: null });
    console.log('🔔 Unread count for user:', req.user.email, '=', unreadCount);
    
    res.json({ success: true, data: { notifications: data, unreadCount, nextCursor } });
  } catch (e) {
    console.error('❌ List notifications error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @swagger
 * /notifications/mark-seen:
 *   post:
 *     summary: Mark all notifications seen
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.post('/mark-seen', protect, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id, seenAt: null }, { $set: { seenAt: new Date() } });
    res.json({ success: true });
  } catch (e) {
    console.error('Mark seen error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @swagger
 * /notifications/mark-read:
 *   post:
 *     summary: Mark notifications read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.post('/mark-read', [protect, body('ids').isArray().withMessage('ids array required')], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const ids = req.body.ids || [];
    await Notification.updateMany({ _id: { $in: ids }, userId: req.user._id }, { $set: { readAt: new Date() } });
    res.json({ success: true });
  } catch (e) {
    console.error('Mark read error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @swagger
 * /notifications/{id}:
 *   delete:
 *     summary: Delete notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', protect, async (req, res) => {
  try {
    await Notification.deleteOne({ _id: req.params.id, userId: req.user._id });
    res.json({ success: true });
  } catch (e) {
    console.error('Delete notification error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @swagger
 * /notifications/preferences:
 *   get:
 *     summary: Get user notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *   put:
 *     summary: Update user notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.get('/preferences', protect, async (req, res) => {
  try {
    const prefs = await UserPreferences.findOne({ userId: req.user._id });
    res.json({ success: true, data: { preferences: prefs } });
  } catch (e) {
    console.error('Get preferences error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/preferences', protect, async (req, res) => {
  try {
    const prefs = await UserPreferences.findOneAndUpdate(
      { userId: req.user._id },
      { $set: req.body },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: { preferences: prefs } });
  } catch (e) {
    console.error('Update preferences error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * @swagger
 * /notifications/debug:
 *   get:
 *     summary: Debug notification data (admin only)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Debug info
 */
router.get('/debug', protect, async (req, res) => {
  try {
    // Get all notifications for this user
    const userNotifications = await Notification.find({ userId: req.user._id }).sort({ _id: -1 }).limit(10);
    
    // Get total notifications count
    const totalNotifications = await Notification.countDocuments({});
    const userNotificationsCount = await Notification.countDocuments({ userId: req.user._id });
    
    // Get sample notifications from other users (for debugging)
    const otherNotifications = await Notification.aggregate([
      { $match: { userId: { $ne: req.user._id } } },
      { $sample: { size: 5 } },
      { $project: { userId: 1, title: 1, type: 1, createdAt: 1 } }
    ]);
    
    res.json({
      success: true,
      data: {
        currentUser: {
          id: req.user._id,
          email: req.user.email
        },
        userNotifications: userNotifications.map(n => ({
          id: n._id,
          userId: n.userId,
          title: n.title,
          type: n.type,
          createdAt: n.createdAt
        })),
        counts: {
          totalNotificationsInSystem: totalNotifications,
          userNotifications: userNotificationsCount
        },
        otherUsersNotifications: otherNotifications
      }
    });
  } catch (e) {
    console.error('Debug notifications error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

// Unsubscribe route (token-based)
router.get('/unsubscribe/:userId/:token', async (req, res) => {
  try {
    const { userId, token } = req.params;
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    if (String(payload.sub) !== String(userId) || payload.purpose !== 'unsubscribe') throw new Error('Invalid token');
    await UserPreferences.findOneAndUpdate({ userId }, { $set: { categories: { announcements: false, assignments: false, grades: false } } }, { upsert: true });
    res.send('You have been unsubscribed from email notifications.');
  } catch (e) {
    console.error('Unsubscribe error:', e);
    res.status(400).send('Invalid or expired unsubscribe link.');
  }
});


