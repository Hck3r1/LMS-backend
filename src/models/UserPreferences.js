const mongoose = require('mongoose');

const userPreferencesSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
  channels: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false }
  },
  categories: {
    assignments: { type: Boolean, default: true },
    grades: { type: Boolean, default: true },
    announcements: { type: Boolean, default: true },
    modules: { type: Boolean, default: true },
    enrollment: { type: Boolean, default: true }
  },
  quietHours: {
    enabled: { type: Boolean, default: false },
    start: { type: String, default: '22:00' },
    end: { type: String, default: '07:00' }
  },
  digest: {
    enabled: { type: Boolean, default: false },
    frequency: { type: String, enum: ['daily', 'weekly'], default: 'weekly' }
  }
}, { timestamps: true });

module.exports = mongoose.model('UserPreferences', userPreferencesSchema);


