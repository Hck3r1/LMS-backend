# Email Configuration for MIC LMS

## Current Issue
The email sending is failing with connection timeout errors. This is because SMTP credentials are not properly configured in the Render environment.

## Solutions

### Option 1: Configure SMTP in Render Environment Variables

Add these environment variables in your Render dashboard:

```
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@mic-lms.com
```

**For Gmail:**
1. Enable 2-factor authentication
2. Generate an "App Password" (not your regular password)
3. Use the app password in `EMAIL_PASS`

**For other providers:**
- **Outlook/Hotmail**: `smtp-mail.outlook.com:587`
- **Yahoo**: `smtp.mail.yahoo.com:587`
- **SendGrid**: Use their SMTP settings
- **Mailgun**: Use their SMTP settings

### Option 2: Use a Dedicated Email Service

#### SendGrid (Recommended)
1. Sign up at [SendGrid](https://sendgrid.com)
2. Create an API key
3. Use these settings:
```
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=your-sendgrid-api-key
```

#### Mailgun
1. Sign up at [Mailgun](https://mailgun.com)
2. Get SMTP credentials
3. Use their provided settings

### Option 3: Development Fallback

For development/testing, the system will now:
1. Generate the reset token
2. Include it in the API response if email fails
3. Log the token to console for manual testing

## Testing Email Configuration

1. **Check logs** for email configuration status on server startup
2. **Test forgot password** - check if email is sent
3. **Check console logs** for detailed error messages
4. **Verify environment variables** are set correctly

## Current Status

The password reset flow will work even if email fails:
- ✅ Reset token is generated and stored
- ✅ User can still reset password using the token
- ✅ Email failure doesn't break the flow
- ✅ Token is included in response for development

## Next Steps

1. **Set up proper SMTP credentials** in Render environment variables
2. **Test the email sending** with a real email address
3. **Verify the complete flow** works end-to-end
