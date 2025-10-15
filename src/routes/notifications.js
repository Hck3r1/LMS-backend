const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Notification = require('../models/Notification');
const UserPreferences = require('../models/UserPreferences');
const { protect } = require('../middleware/auth');

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

    const filter = { userId: req.user._id };
    if (unread === 'true') filter.readAt = null;
    if (cursor) filter._id = { $lt: cursor };

    const items = await Notification.find(filter).sort({ _id: -1 }).limit(limit + 1);
    const nextCursor = items.length > limit ? items[limit - 1]?._id : null;
    const data = items.slice(0, limit);

    const unreadCount = await Notification.countDocuments({ userId: req.user._id, readAt: null });
    res.json({ success: true, data: { notifications: data, unreadCount, nextCursor } });
  } catch (e) {
    console.error('List notifications error:', e);
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

module.exports = router;


