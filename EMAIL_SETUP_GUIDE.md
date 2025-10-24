# 📧 Email Setup Guide for MIC LMS

## 🚨 **Current Issue: Gmail SMTP Blocked by Render**

Render and many cloud providers block Gmail SMTP connections to prevent spam. You need to use a dedicated email service.

## 🚀 **Recommended Solutions:**

### **Option 1: SendGrid (Easiest)**
- **Free Tier:** 100 emails/day
- **Setup:** 5 minutes
- **Reliability:** Excellent

**Steps:**
1. Go to [SendGrid.com](https://sendgrid.com)
2. Sign up for free account
3. Go to Settings → API Keys
4. Create new API key
5. Copy the API key

**Environment Variables:**
```bash
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=your-sendgrid-api-key-here
EMAIL_FROM=oysglms@gmail.com
```

### **Option 2: Mailgun (Most Popular)**
- **Free Tier:** 10,000 emails/month
- **Setup:** 10 minutes
- **Reliability:** Excellent

**Steps:**
1. Go to [Mailgun.com](https://mailgun.com)
2. Sign up for free account
3. Go to Sending → Domains
4. Add your domain or use sandbox
5. Go to Settings → SMTP
6. Copy SMTP credentials

**Environment Variables:**
```bash
EMAIL_HOST=smtp.mailgun.org
EMAIL_PORT=587
EMAIL_USER=your-mailgun-smtp-username
EMAIL_PASS=your-mailgun-smtp-password
EMAIL_FROM=oysglms@gmail.com
```

### **Option 3: Resend (Modern)**
- **Free Tier:** 3,000 emails/month
- **Setup:** 5 minutes
- **Reliability:** Good

**Steps:**
1. Go to [Resend.com](https://resend.com)
2. Sign up for free account
3. Go to API Keys
4. Create new API key
5. Copy the API key

**Environment Variables:**
```bash
EMAIL_HOST=smtp.resend.com
EMAIL_PORT=587
EMAIL_USER=resend
EMAIL_PASS=your-resend-api-key-here
EMAIL_FROM=oysglms@gmail.com
```

## 🔧 **How to Update Environment Variables in Render:**

1. Go to your Render dashboard
2. Select your LMS backend service
3. Go to "Environment" tab
4. Add/update the email variables
5. Click "Save Changes"
6. Redeploy your service

## 🧪 **Testing Email Configuration:**

### **Test Email Configuration:**
```
GET https://lms-backend-u90k.onrender.com/api/email-config
```

### **Send Test Email:**
```
GET https://lms-backend-u90k.onrender.com/api/test-email?to=your-email@example.com
```

## 📧 **Email Features Working:**

- ✅ Password reset emails
- ✅ Course enrollment notifications
- ✅ Assignment submission alerts
- ✅ Module creation notifications
- ✅ Message notifications
- ✅ Assignment grading notifications

## 🚨 **Important Notes:**

1. **Gmail SMTP won't work** on Render due to network restrictions
2. **Use dedicated email services** like SendGrid, Mailgun, or Resend
3. **Free tiers are sufficient** for development and testing
4. **Update environment variables** in Render dashboard
5. **Redeploy after changes** to environment variables

## 🎯 **Quick Start (SendGrid):**

1. Sign up at [SendGrid.com](https://sendgrid.com)
2. Get API key from Settings → API Keys
3. Update Render environment variables:
   ```
   EMAIL_HOST=smtp.sendgrid.net
   EMAIL_PORT=587
   EMAIL_USER=apikey
   EMAIL_PASS=your-api-key-here
   EMAIL_FROM=oysglms@gmail.com
   ```
4. Redeploy your service
5. Test with: `https://lms-backend-u90k.onrender.com/api/test-email?to=your-email@example.com`

## 🔍 **Troubleshooting:**

- **Connection timeout:** Use SendGrid/Mailgun instead of Gmail
- **Authentication failed:** Check API key/credentials
- **Email not received:** Check spam folder
- **Rate limited:** Upgrade to paid plan

---

**Choose SendGrid for the easiest setup!** 🚀
