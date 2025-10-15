const Assignment = require('../models/Assignment');
const Course = require('../models/Course');
const Submission = require('../models/Submission');
const Notification = require('../models/Notification');
const UserPreferences = require('../models/UserPreferences');
const { emitToUser } = require('./socket');

function isWithinQuietHours(prefs) {
  if (!prefs?.quietHours?.enabled) return false;
  const now = new Date();
  const [qsH, qsM] = (prefs.quietHours.start || '22:00').split(':').map(Number);
  const [qeH, qeM] = (prefs.quietHours.end || '07:00').split(':').map(Number);
  const start = new Date(now); start.setHours(qsH, qsM, 0, 0);
  const end = new Date(now); end.setHours(qeH, qeM, 0, 0);
  if (start <= end) {
    return now >= start && now <= end;
  } else {
    return now >= start || now <= end; // crosses midnight
  }
}

async function runDueSoonScan(windowHours = 24) {
  const now = new Date();
  const upper = new Date(now.getTime() + windowHours * 60 * 60 * 1000);
  // Find assignments due in next window, published
  const assignments = await Assignment.find({ isPublished: true, dueDate: { $gte: now, $lte: upper } })
    .populate('courseId', 'title enrolledStudents')
    .populate('moduleId', 'title')
    .select('title dueDate courseId moduleId');

  for (const a of assignments) {
    const course = a.courseId;
    const enrolled = course?.enrolledStudents || [];
    if (!enrolled.length) continue;

    // For each student, check if submitted; if not, notify (and avoid dupes)
    for (const e of enrolled) {
      const studentId = e.student;
      if (!studentId) continue;

      const hasSubmitted = await Submission.findOne({ assignmentId: a._id, studentId }).lean();
      if (hasSubmitted) continue;

      // Respect user preferences (assignments category + quiet hours)
      const prefs = await UserPreferences.findOne({ userId: studentId }).lean();
      if (prefs && prefs.categories && prefs.categories.assignments === false) continue;
      if (isWithinQuietHours(prefs)) continue;

      const exists = await Notification.findOne({ userId: studentId, assignmentId: a._id, type: 'assignment', title: 'Assignment due soon' }).lean();
      if (exists) continue;

      await Notification.create({
        userId: studentId,
        type: 'assignment',
        title: 'Assignment due soon',
        body: `${a.title} is due ${a.dueDate.toLocaleString()}.`,
        link: `/assignments/${a._id}`,
        courseId: course._id,
        moduleId: a.moduleId,
        assignmentId: a._id
      });
      emitToUser(studentId.toString(), 'notification:new', {
        title: 'Assignment due soon',
        body: `${a.title} is due ${a.dueDate.toLocaleString()}.`,
        assignmentId: a._id,
        courseId: course._id
      });
    }
  }
}

function startDueSoonReminderScheduler() {
  // Run at startup, then every hour
  runDueSoonScan(24).catch(() => {});
  setInterval(() => runDueSoonScan(24).catch(() => {}), 60 * 60 * 1000);
}

module.exports = { startDueSoonReminderScheduler };


