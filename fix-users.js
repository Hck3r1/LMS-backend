#!/usr/bin/env node

/**
 * Script to fix undefined arrays for all users
 * Run this locally with: node fix-users.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('./src/models/User');

async function fixAllUsers() {
  try {
    // Connect to database
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lms';
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to database');

    // Find all users
    const users = await User.find({});
    console.log(`📊 Found ${users.length} users to check`);

    let fixedCount = 0;
    
    for (const user of users) {
      const updateData = {};
      let needsUpdate = false;

      // Check and fix arrays
      if (!Array.isArray(user.enrolledCourses)) {
        updateData.enrolledCourses = [];
        needsUpdate = true;
      }
      if (!Array.isArray(user.createdCourses)) {
        updateData.createdCourses = [];
        needsUpdate = true;
      }
      if (!Array.isArray(user.completedModules)) {
        updateData.completedModules = [];
        needsUpdate = true;
      }
      if (!Array.isArray(user.skills)) {
        updateData.skills = [];
        needsUpdate = true;
      }

      if (needsUpdate) {
        await User.findByIdAndUpdate(user._id, updateData);
        console.log(`🔧 Fixed arrays for user: ${user.email}`);
        fixedCount++;
      }
    }

    console.log(`✅ Fixed ${fixedCount} users out of ${users.length} total users`);
    
    // Show summary
    const enrolledStats = await User.aggregate([
      { $match: { role: 'student' } },
      { $project: { email: 1, enrolledCount: { $size: { $ifNull: ['$enrolledCourses', []] } } } },
      { $group: { _id: null, totalEnrolled: { $sum: '$enrolledCount' }, userCount: { $sum: 1 } } }
    ]);

    if (enrolledStats.length > 0) {
      console.log(`📚 Student enrollment summary: ${enrolledStats[0].totalEnrolled} total enrollments across ${enrolledStats[0].userCount} students`);
    }

  } catch (error) {
    console.error('❌ Error fixing users:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Run the script
fixAllUsers();
