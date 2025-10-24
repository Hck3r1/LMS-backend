# Email Delivery Troubleshooting Guide

## Current Issue: "Email sent successfully" but no email received

### Step 1: Check Server Logs

Look for these log messages in your Render logs:

```
✅ Email server is ready to send messages
📧 SMTP Configuration: { host: 'smtp.gmail.com', port: 587, secure: false, from: 'noreply@mic-lms.com' }
📧 Attempting to send email to: user@example.com
✅ Email sent successfully: <message-id>
📧 Email response: 250 2.0.0 OK
📧 Email accepted by: ['user@example.com']
📧 Email rejected by: []
```

### Step 2: Test Email Configuration

Use the test endpoint to verify email setup:

```bash
curl -X POST https://lms-backend-u90k.onrender.com/api/auth/test-email \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@example.com"}'
```

### Step 3: Common Issues & Solutions

#### Issue 1: Emails Going to Spam
- **Check spam/junk folder**
- **Add sender to contacts**
- **Use a proper domain for EMAIL_FROM**

#### Issue 2: Gmail App Password Issues
- **Enable 2-factor authentication**
- **Generate App Password (not regular password)**
- **Use App Password in EMAIL_PASS**

#### Issue 3: SMTP Server Rejection
- **Check if SMTP server accepts emails from your domain**
- **Verify EMAIL_FROM domain matches your setup**
- **Some servers reject emails from localhost/unknown domains**

#### Issue 4: Email Provider Blocking
- **Gmail may block "less secure apps"**
- **Some providers block automated emails**
- **Check provider's sending limits**

### Step 4: Alternative Email Services

#### Option A: SendGrid (Recommended)
```bash
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=your-sendgrid-api-key
EMAIL_FROM=noreply@yourdomain.com
```

#### Option B: Mailgun
```bash
EMAIL_HOST=smtp.mailgun.org
EMAIL_PORT=587
EMAIL_USER=postmaster@your-domain.mailgun.org
EMAIL_PASS=your-mailgun-password
EMAIL_FROM=noreply@yourdomain.com
```

#### Option C: AWS SES
```bash
EMAIL_HOST=email-smtp.us-east-1.amazonaws.com
EMAIL_PORT=587
EMAIL_USER=your-ses-smtp-username
EMAIL_PASS=your-ses-smtp-password
EMAIL_FROM=noreply@yourdomain.com
```

### Step 5: Development Testing

For development, you can:

1. **Check console logs** for the reset token
2. **Use the token directly** in the reset URL
3. **Test without email** - the password reset still works

### Step 6: Email Content Issues

Check if the email content is causing issues:

- **HTML content** might be flagged as spam
- **Links in emails** might be blocked
- **Email size** might be too large
- **Subject line** might trigger spam filters

### Step 7: Render Environment Variables

Make sure these are set in your Render dashboard:

```
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@mic-lms.com
FRONTEND_URL=https://mic-lms.vercel.app
```

### Step 8: Debugging Commands

Test your SMTP configuration:

```bash
# Test SMTP connection
telnet smtp.gmail.com 587

# Test with curl
curl -v smtp://smtp.gmail.com:587
```

### Step 9: Email Delivery Services

If SMTP continues to fail, consider:

1. **SendGrid** - Reliable email delivery
2. **Mailgun** - Developer-friendly
3. **AWS SES** - Cost-effective for high volume
4. **Postmark** - Transactional email focused

### Step 10: Immediate Workaround

The password reset system works even without email:

1. **Request password reset**
2. **Check browser console** for reset token
3. **Use the token** in the reset URL
4. **Complete password reset**

### Next Steps

1. **Check Render logs** for detailed email information
2. **Test with a different email provider**
3. **Verify environment variables** are set correctly
4. **Use the test endpoint** to debug email sending
5. **Consider using a dedicated email service** like SendGrid
