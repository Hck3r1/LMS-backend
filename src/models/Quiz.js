const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
  question: { type: String, required: true, trim: true },
  options: { type: [String], required: true, validate: v => Array.isArray(v) && v.length >= 2 },
  correctIndex: { type: Number, required: true, min: 0 },
  points: { type: Number, default: 1, min: 0 }
}, { _id: false });

const QuizSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  moduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Module', required: true },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 2000 },
  questions: { type: [QuestionSchema], default: [] },
  attemptsAllowed: { type: Number, default: 1, min: 1, max: 10 },
  timeLimitMinutes: { type: Number, default: 0, min: 0 },
  isPublished: { type: Boolean, default: false }
}, { timestamps: true });

QuizSchema.methods.grade = function(answers) {
  let score = 0;
  let total = 0;
  this.questions.forEach((q, idx) => {
    total += q.points || 1;
    const a = answers?.[idx];
    if (typeof a === 'number' && a === q.correctIndex) score += (q.points || 1);
  });
  return { score, total, percentage: total ? Math.round((score / total) * 100) : 0 };
};

module.exports = mongoose.model('Quiz', QuizSchema);


