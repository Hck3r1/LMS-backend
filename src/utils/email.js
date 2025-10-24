const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

const smtpHost = process.env.EMAIL_HOST || process.env.SMTP_HOST;
const smtpPort = parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT || '587');
const smtpUser = process.env.EMAIL_USER || process.env.SMTP_USER;
const smtpPass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
const fromEmail = process.env.EMAIL_FROM || 'no-reply@mic-lms.local';

let transporter;
if (smtpHost && smtpUser && smtpPass) {
  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 5000,    // 5 seconds
    socketTimeout: 10000,    // 10 seconds
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 20000, // 20 seconds
    rateLimit: 5 // max 5 emails per 20 seconds
  });
  
  // Test the connection
  transporter.verify((error, success) => {
    if (error) {
      console.error('❌ Email configuration error:', error.message);
      console.log('📧 Email will be disabled. Please check your SMTP settings.');
      console.log('🔧 Current SMTP config:', {
        host: smtpHost,
        port: smtpPort,
        user: smtpUser ? `${smtpUser.substring(0, 3)}***` : 'not set',
        from: fromEmail
      });
    } else {
      console.log('✅ Email server is ready to send messages');
      console.log('📧 SMTP Configuration:', {
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        from: fromEmail
      });
    }
  });
}

async function sendEmail({ to, subject, html, text }) {
  if (!transporter) {
    console.warn('Email transporter not configured; skipping email to', to);
    return { success: false, skipped: true };
  }
  
  const mail = { from: fromEmail, to, subject, html, text };
  
  try {
    console.log('📧 Attempting to send email to:', to);
    console.log('📧 Email subject:', subject);
    console.log('📧 From address:', fromEmail);
    
    const result = await transporter.sendMail(mail);
    console.log('✅ Email sent successfully:', result.messageId);
    console.log('📧 Email response:', result.response);
    console.log('📧 Email accepted by:', result.accepted);
    console.log('📧 Email rejected by:', result.rejected);
    
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
    console.error('📧 Email details:', { to, subject, from: fromEmail });
    console.error('📧 Full error:', error);
    
    // Handle specific error types
    if (error.code === 'ETIMEDOUT') {
      console.error('⏰ Email timeout - SMTP server not responding');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('🔌 Email connection refused - check SMTP host/port');
    } else if (error.code === 'EAUTH') {
      console.error('🔐 Email authentication failed - check credentials');
    } else if (error.code === 'EMESSAGE') {
      console.error('📧 Message rejected by server - check email content/format');
    }
    
    return { success: false, error: error.message };
  }
}

function assignmentGradedTemplate({ studentName, courseTitle, assignmentTitle, grade }) {
  const subject = `Your assignment was graded: ${assignmentTitle}`;
  const body = `Hello ${studentName || ''},\n\nYour submission for "${assignmentTitle}" in ${courseTitle} was graded: ${grade}%.\n\nLog in to view detailed feedback.`;
  const html = `<p>Hello ${studentName || ''},</p><p>Your submission for <strong>${assignmentTitle}</strong> in <strong>${courseTitle}</strong> was graded: <strong>${grade}%</strong>.</p><p><a href="${process.env.FRONTEND_URL || ''}">Open LMS</a> to view feedback.</p>`;
  return { subject, text: body, html };
}

function assignmentSubmittedTemplate({ tutorName, courseTitle, assignmentTitle, studentName }) {
  const subject = `New submission: ${assignmentTitle}`;
  const body = `Hello ${tutorName || ''},\n\n${studentName || 'A student'} submitted "${assignmentTitle}" in ${courseTitle}.\n\nLog in to review and grade.`;
  const html = `<p>Hello ${tutorName || ''},</p><p><strong>${studentName || 'A student'}</strong> submitted <strong>${assignmentTitle}</strong> in <strong>${courseTitle}</strong>.</p><p><a href="${process.env.FRONTEND_URL || ''}">Open LMS</a> to grade.</p>`;
  return { subject, text: body, html };
}

function assignmentDueSoonTemplate({ studentName, courseTitle, assignmentTitle, dueDate }) {
  const subject = `Reminder: ${assignmentTitle} is due soon`;
  const body = `Hello ${studentName || ''},\n\n"${assignmentTitle}" in ${courseTitle} is due on ${dueDate}.\n\nPlease submit before the deadline.`;
  const html = `<p>Hello ${studentName || ''},</p><p><strong>${assignmentTitle}</strong> in <strong>${courseTitle}</strong> is due on <strong>${dueDate}</strong>.</p><p>Please submit before the deadline.</p>`;
  return { subject, text: body, html };
}

function assignmentCreatedTemplate({ studentName, courseTitle, assignmentTitle, dueDate }) {
  const subject = `New assignment posted: ${assignmentTitle}`;
  const body = `Hello ${studentName || ''},\n\nA new assignment "${assignmentTitle}" was posted in ${courseTitle}${dueDate ? `, due on ${dueDate}` : ''}.\n\nLog in to view details.`;
  const html = `<p>Hello ${studentName || ''},</p><p>A new assignment <strong>${assignmentTitle}</strong> was posted in <strong>${courseTitle}</strong>${dueDate ? `, due on <strong>${dueDate}</strong>` : ''}.</p><p><a href="${process.env.FRONTEND_URL || ''}">Open LMS</a> to view details.</p>`;
  return { subject, text: body, html };
}

module.exports = {
  sendEmail,
  assignmentGradedTemplate,
  assignmentSubmittedTemplate,
  assignmentDueSoonTemplate,
  assignmentCreatedTemplate,
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


