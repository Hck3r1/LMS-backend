const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

// Smart email configuration: Gmail locally, Resend on Render
let transporter;
let emailService = 'none';

if (process.env.RESEND_API_KEY) {
  // Use Resend on Render (works perfectly)
  transporter = nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 587,
    secure: false,
    auth: {
      user: 'resend',
      pass: process.env.RESEND_API_KEY,
    },
  });
  emailService = 'Resend';
  console.log('✅ Resend service configured (works on Render)');
} else if (process.env.EMAIL_USERNAME && process.env.EMAIL_PASSWORD) {
  // Use Gmail locally
  transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
  emailService = 'Gmail';
  console.log('✅ Gmail service configured (works locally)');
} else {
  transporter = null;
  console.log('⚠️ No email service configured');
}

console.log('📧 Email Configuration:');
console.log('📧 EMAIL_USERNAME:', process.env.EMAIL_USERNAME ? '***SET***' : 'NOT SET');
console.log('📧 EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? '***SET***' : 'NOT SET');
console.log('📧 EMAIL_FROM:', process.env.EMAIL_FROM || 'NOT SET');

async function sendEmail({ to, subject, html, text }) {
  if (!to) {
    console.error('❌ Missing recipient email');
    return { success: false, error: 'Missing recipient email' };
  }
  
  if (!transporter) {
    console.warn('📧 No email service configured - logging email instead');
    console.log('📧 Email would be sent to:', to);
    console.log('📧 Subject:', subject);
    console.log('📧 Content:', html || text);
    return { success: false, skipped: true, message: 'Email service not configured' };
  }
  
  const from = process.env.EMAIL_FROM || process.env.FROM_EMAIL || 'no-reply@mic-lms.com';
  
  try {
    console.log('📧 Attempting to send email to:', to);
    console.log('📧 Email subject:', subject);
    console.log('📧 From address:', from);
    console.log('📧 Using service:', emailService);
    
    await transporter.sendMail({ from, to, subject, html, text });
    
    console.log('✅ Email sent successfully to:', to);
    return { success: true };
    
  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
    console.error('📧 Email details:', { to, subject, from });
    console.error('📧 Full error:', error);
    
    return { success: false, error: error.message };
  }
}

function assignmentGradedTemplate({ studentName, courseTitle, assignmentTitle, grade }) {
  const subject = `🎉 Your assignment was graded: ${assignmentTitle}`;
  const body = `Hello ${studentName || 'Student'},\n\nYour submission for "${assignmentTitle}" in ${courseTitle} was graded: ${grade}%.\n\nLog in to view detailed feedback.`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Assignment Graded</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
          <div style="background-color: #ffffff; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 36px;">🎉</span>
          </div>
          <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Assignment Graded!</h1>
          <p style="color: #e2e8f0; margin: 10px 0 0; font-size: 16px;">Your work has been reviewed</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 40px 30px;">
          <h2 style="color: #2d3748; margin: 0 0 20px; font-size: 24px; font-weight: 600;">Hello ${studentName || 'Student'}!</h2>
          
          <div style="background-color: #f7fafc; border-left: 4px solid #667eea; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #2d3748; margin: 0 0 10px; font-size: 18px; font-weight: 600;">${assignmentTitle}</h3>
            <p style="color: #4a5568; margin: 0 0 10px; font-size: 16px;">Course: <strong>${courseTitle}</strong></p>
            <div style="display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 8px 16px; border-radius: 20px; font-weight: 600; font-size: 18px;">
              Grade: ${grade}%
            </div>
          </div>
          
          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 20px 0;">
            Great work! Your assignment has been reviewed and graded. Click the button below to view detailed feedback and comments from your instructor.
          </p>
          
          <!-- CTA Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || '#'}" style="display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
              View Feedback
            </a>
          </div>
          
          <div style="background-color: #edf2f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #2d3748; margin: 0 0 10px; font-size: 16px; font-weight: 600;">💡 Next Steps:</h4>
            <ul style="color: #4a5568; margin: 0; padding-left: 20px; font-size: 14px;">
              <li>Review your instructor's feedback</li>
              <li>Check for any areas of improvement</li>
              <li>Apply learnings to future assignments</li>
            </ul>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="color: #718096; margin: 0; font-size: 14px;">
            This is an automated notification from MIC LMS.<br>
            If you have any questions, please contact your instructor.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return { subject, text: body, html };
}

function assignmentSubmittedTemplate({ tutorName, courseTitle, assignmentTitle, studentName }) {
  const subject = `📝 New submission: ${assignmentTitle}`;
  const body = `Hello ${tutorName || 'Instructor'},\n\n${studentName || 'A student'} submitted "${assignmentTitle}" in ${courseTitle}.\n\nLog in to review and grade.`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Assignment Submission</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); padding: 40px 30px; text-align: center;">
          <div style="background-color: #ffffff; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 36px;">📝</span>
          </div>
          <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">New Submission!</h1>
          <p style="color: #e2e8f0; margin: 10px 0 0; font-size: 16px;">A student has submitted their work</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 40px 30px;">
          <h2 style="color: #2d3748; margin: 0 0 20px; font-size: 24px; font-weight: 600;">Hello ${tutorName || 'Instructor'}!</h2>
          
          <div style="background-color: #f0fff4; border-left: 4px solid #48bb78; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #2d3748; margin: 0 0 10px; font-size: 18px; font-weight: 600;">${assignmentTitle}</h3>
            <p style="color: #4a5568; margin: 0 0 10px; font-size: 16px;">Course: <strong>${courseTitle}</strong></p>
            <p style="color: #4a5568; margin: 0; font-size: 16px;">Submitted by: <strong>${studentName || 'A student'}</strong></p>
          </div>
          
          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 20px 0;">
            A student has submitted their assignment and is waiting for your review. Click the button below to access the LMS and grade their work.
          </p>
          
          <!-- CTA Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || '#'}" style="display: inline-block; background: linear-gradient(135deg, #48bb78, #38a169); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(72, 187, 120, 0.4);">
              Review Submission
            </a>
          </div>
          
          <div style="background-color: #edf2f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #2d3748; margin: 0 0 10px; font-size: 16px; font-weight: 600;">⏰ Quick Actions:</h4>
            <ul style="color: #4a5568; margin: 0; padding-left: 20px; font-size: 14px;">
              <li>Review the submission thoroughly</li>
              <li>Provide constructive feedback</li>
              <li>Assign an appropriate grade</li>
              <li>Notify the student when complete</li>
            </ul>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="color: #718096; margin: 0; font-size: 14px;">
            This is an automated notification from MIC LMS.<br>
            Please review and grade the submission at your earliest convenience.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return { subject, text: body, html };
}

function assignmentDueSoonTemplate({ studentName, courseTitle, assignmentTitle, dueDate }) {
  const subject = `⏰ Reminder: ${assignmentTitle} is due soon`;
  const body = `Hello ${studentName || 'Student'},\n\n"${assignmentTitle}" in ${courseTitle} is due on ${dueDate}.\n\nPlease submit before the deadline.`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Assignment Due Soon</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #ed8936 0%, #dd6b20 100%); padding: 40px 30px; text-align: center;">
          <div style="background-color: #ffffff; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 36px;">⏰</span>
          </div>
          <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Due Soon!</h1>
          <p style="color: #fed7d7; margin: 10px 0 0; font-size: 16px;">Don't miss the deadline</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 40px 30px;">
          <h2 style="color: #2d3748; margin: 0 0 20px; font-size: 24px; font-weight: 600;">Hello ${studentName || 'Student'}!</h2>
          
          <div style="background-color: #fffaf0; border-left: 4px solid #ed8936; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #2d3748; margin: 0 0 10px; font-size: 18px; font-weight: 600;">${assignmentTitle}</h3>
            <p style="color: #4a5568; margin: 0 0 10px; font-size: 16px;">Course: <strong>${courseTitle}</strong></p>
            <div style="display: inline-block; background: linear-gradient(135deg, #ed8936, #dd6b20); color: white; padding: 8px 16px; border-radius: 20px; font-weight: 600; font-size: 16px;">
              Due: ${dueDate}
            </div>
          </div>
          
          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 20px 0;">
            This is a friendly reminder that your assignment is due soon. Make sure to submit your work before the deadline to avoid any late penalties.
          </p>
          
          <!-- CTA Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || '#'}" style="display: inline-block; background: linear-gradient(135deg, #ed8936, #dd6b20); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(237, 137, 54, 0.4);">
              Submit Assignment
            </a>
          </div>
          
          <div style="background-color: #edf2f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #2d3748; margin: 0 0 10px; font-size: 16px; font-weight: 600;">📋 Before You Submit:</h4>
            <ul style="color: #4a5568; margin: 0; padding-left: 20px; font-size: 14px;">
              <li>Review the assignment requirements</li>
              <li>Check your work for completeness</li>
              <li>Ensure all files are attached</li>
              <li>Submit before the deadline</li>
            </ul>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="color: #718096; margin: 0; font-size: 14px;">
            This is an automated reminder from MIC LMS.<br>
            If you have any questions, please contact your instructor.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return { subject, text: body, html };
}

function assignmentCreatedTemplate({ studentName, courseTitle, assignmentTitle, dueDate }) {
  const subject = `📋 New assignment posted: ${assignmentTitle}`;
  const body = `Hello ${studentName || 'Student'},\n\nA new assignment "${assignmentTitle}" was posted in ${courseTitle}${dueDate ? `, due on ${dueDate}` : ''}.\n\nLog in to view details.`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Assignment Posted</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%); padding: 40px 30px; text-align: center;">
          <div style="background-color: #ffffff; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 36px;">📋</span>
          </div>
          <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">New Assignment!</h1>
          <p style="color: #bee3f8; margin: 10px 0 0; font-size: 16px;">Your instructor has posted new work</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 40px 30px;">
          <h2 style="color: #2d3748; margin: 0 0 20px; font-size: 24px; font-weight: 600;">Hello ${studentName || 'Student'}!</h2>
          
          <div style="background-color: #ebf8ff; border-left: 4px solid #4299e1; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #2d3748; margin: 0 0 10px; font-size: 18px; font-weight: 600;">${assignmentTitle}</h3>
            <p style="color: #4a5568; margin: 0 0 10px; font-size: 16px;">Course: <strong>${courseTitle}</strong></p>
            ${dueDate ? `<div style="display: inline-block; background: linear-gradient(135deg, #4299e1, #3182ce); color: white; padding: 8px 16px; border-radius: 20px; font-weight: 600; font-size: 16px;">Due: ${dueDate}</div>` : ''}
          </div>
          
          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 20px 0;">
            Your instructor has posted a new assignment for you to complete. Click the button below to view the full details, requirements, and submission guidelines.
          </p>
          
          <!-- CTA Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || '#'}" style="display: inline-block; background: linear-gradient(135deg, #4299e1, #3182ce); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(66, 153, 225, 0.4);">
              View Assignment
            </a>
          </div>
          
          <div style="background-color: #edf2f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #2d3748; margin: 0 0 10px; font-size: 16px; font-weight: 600;">📝 What to Do Next:</h4>
            <ul style="color: #4a5568; margin: 0; padding-left: 20px; font-size: 14px;">
              <li>Read the assignment requirements carefully</li>
              <li>Check the due date and plan your time</li>
              <li>Review any attached materials or resources</li>
              <li>Start working on your submission</li>
            </ul>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="color: #718096; margin: 0; font-size: 14px;">
            This is an automated notification from MIC LMS.<br>
            If you have any questions about the assignment, please contact your instructor.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return { subject, text: body, html };
}

function passwordResetTemplate({ userName, resetLink, expiresIn = '1 hour' }) {
  const subject = '🔐 Password Reset Request - MIC LMS';
  const body = `Hello ${userName || 'User'},\n\nYou requested a password reset for your MIC LMS account.\n\nClick the link below to reset your password:\n${resetLink}\n\nThis link will expire in ${expiresIn}.\n\nIf you didn't request this reset, please ignore this email.`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset Request</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%); padding: 40px 30px; text-align: center;">
          <div style="background-color: #ffffff; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 36px;">🔐</span>
          </div>
          <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Password Reset</h1>
          <p style="color: #fed7d7; margin: 10px 0 0; font-size: 16px;">Secure your account</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 40px 30px;">
          <h2 style="color: #2d3748; margin: 0 0 20px; font-size: 24px; font-weight: 600;">Hello ${userName || 'User'}!</h2>
          
          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 20px 0;">
            You requested a password reset for your MIC LMS account. Click the button below to create a new password.
          </p>
          
          <div style="background-color: #fef5e7; border-left: 4px solid #e53e3e; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #2d3748; margin: 0 0 10px; font-size: 16px; font-weight: 600;">⏰ Important:</h4>
            <p style="color: #4a5568; margin: 0; font-size: 14px;">This link will expire in <strong>${expiresIn}</strong>. Please reset your password as soon as possible.</p>
          </div>
          
          <!-- CTA Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #e53e3e, #c53030); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(229, 62, 62, 0.4);">
              Reset Password
            </a>
          </div>
          
          <div style="background-color: #edf2f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #2d3748; margin: 0 0 10px; font-size: 16px; font-weight: 600;">🔒 Security Tips:</h4>
            <ul style="color: #4a5568; margin: 0; padding-left: 20px; font-size: 14px;">
              <li>Choose a strong, unique password</li>
              <li>Don't share your password with anyone</li>
              <li>If you didn't request this reset, ignore this email</li>
              <li>Contact support if you have concerns</li>
            </ul>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="color: #718096; margin: 0; font-size: 14px;">
            This is an automated security email from MIC LMS.<br>
            If you didn't request this reset, please contact support immediately.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return { subject, text: body, html };
}

function courseEnrollmentTemplate({ studentName, courseTitle, instructorName, courseDescription }) {
  const subject = `🎓 Welcome to ${courseTitle}!`;
  const body = `Hello ${studentName || 'Student'},\n\nWelcome to ${courseTitle}! Your instructor ${instructorName} is excited to have you in the class.\n\nCourse: ${courseDescription}\n\nLog in to start learning!`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to Course</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #9f7aea 0%, #805ad5 100%); padding: 40px 30px; text-align: center;">
          <div style="background-color: #ffffff; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 36px;">🎓</span>
          </div>
          <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Welcome!</h1>
          <p style="color: #e9d8fd; margin: 10px 0 0; font-size: 16px;">You're now enrolled in the course</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 40px 30px;">
          <h2 style="color: #2d3748; margin: 0 0 20px; font-size: 24px; font-weight: 600;">Hello ${studentName || 'Student'}!</h2>
          
          <div style="background-color: #faf5ff; border-left: 4px solid #9f7aea; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #2d3748; margin: 0 0 10px; font-size: 18px; font-weight: 600;">${courseTitle}</h3>
            <p style="color: #4a5568; margin: 0 0 10px; font-size: 16px;">Instructor: <strong>${instructorName}</strong></p>
            <p style="color: #4a5568; margin: 0; font-size: 16px;">${courseDescription}</p>
          </div>
          
          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 20px 0;">
            Congratulations! You're now enrolled in this course. Your instructor is excited to have you in the class and looks forward to your participation.
          </p>
          
          <!-- CTA Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || '#'}" style="display: inline-block; background: linear-gradient(135deg, #9f7aea, #805ad5); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(159, 122, 234, 0.4);">
              Start Learning
            </a>
          </div>
          
          <div style="background-color: #edf2f7; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #2d3748; margin: 0 0 10px; font-size: 16px; font-weight: 600;">📚 Getting Started:</h4>
            <ul style="color: #4a5568; margin: 0; padding-left: 20px; font-size: 14px;">
              <li>Explore the course materials and modules</li>
              <li>Introduce yourself in the course forum</li>
              <li>Check the course schedule and deadlines</li>
              <li>Reach out to your instructor if you have questions</li>
            </ul>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="color: #718096; margin: 0; font-size: 14px;">
            This is an automated welcome email from MIC LMS.<br>
            We're excited to have you as part of our learning community!
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return { subject, text: body, html };
}

module.exports = {
  sendEmail,
  assignmentGradedTemplate,
  assignmentSubmittedTemplate,
  assignmentDueSoonTemplate,
  assignmentCreatedTemplate,
  passwordResetTemplate,
  courseEnrollmentTemplate,
  generateUnsubscribeLink: (userId) => {
    try {
      const token = jwt.sign({ sub: String(userId), purpose: 'unsubscribe' }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });
      const base = (process.env.BACKEND_URL || (process.env.FRONTEND_URL || '').replace(/\/$/, '').replace(/$/,'').replace(/$/,'')) || 'http://localhost:5000';
      return `${base.replace(/\/$/,'')}/api/notifications/unsubscribe/${userId}/${token}`;
    } catch {
      return '';
    }
  }
};


