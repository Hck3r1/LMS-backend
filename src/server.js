const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { swaggerUi, specs } = require('./config/swagger');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const courseRoutes = require('./routes/courses');
const moduleRoutes = require('./routes/modules');
const assignmentRoutes = require('./routes/assignments');
const submissionRoutes = require('./routes/submissions');
const analyticsRoutes = require('./routes/analytics');
const notificationRoutes = require('./routes/notifications');
const quizRoutes = require('./routes/quizzes');
const forumRoutes = require('./routes/forums');
const messageRoutes = require('./routes/messages');
const reviewRoutes = require('./routes/reviews');
const achievementRoutes = require('./routes/achievements');
const certificateRoutes = require('./routes/certificates');
const progressRoutes = require('./routes/progress');

const app = express();

// Security middleware
app.use(helmet());

// Rate limiting disabled for office LMS - no restrictions needed

// Enhanced CORS configuration for Render deployment
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'https://localhost:3000',
  'https://localhost:3001',
  'https://localhost:3002',
  'https://lms-backend-u90k.onrender.com',
  'https://mic-lms.vercel.app',
  'https://mic-lms-git-main-0xhckrrr.vercel.app', // Vercel preview URLs
  'https://mic-lms-git-develop-0xhckrrr.vercel.app'
].filter(Boolean);

// CORS options with comprehensive configuration
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      console.log('✅ CORS: Allowing request with no origin');
      return callback(null, true);
    }

    // Check if origin is in allowed list
    const isAllowedList = allowedOrigins.includes(origin);
    
    // Check for development tunnels
    const isNgrok = /\.ngrok-free\.app$/i.test(origin) || /\.ngrok\.io$/i.test(origin);
    const isGrok = /\.grok$/i.test(origin) || /\.trycloudflare\.com$/i.test(origin);
    const isRender = /\.onrender\.com$/i.test(origin);
    const isVercel = /\.vercel\.app$/i.test(origin) || /\.vercel\.dev$/i.test(origin);
    const isNetlify = /\.netlify\.app$/i.test(origin) || /\.netlify\.dev$/i.test(origin);
    
    // Check for localhost variations
    const isLocalhost = /^https?:\/\/localhost(:\d+)?$/i.test(origin) || 
                      /^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(origin) ||
                      /^https?:\/\/0\.0\.0\.0(:\d+)?$/i.test(origin);

    const isAllowed = isAllowedList || isNgrok || isGrok || isRender || isVercel || isNetlify || isLocalhost;

    if (isAllowed) {
      console.log(`✅ CORS: Allowing origin: ${origin}`);
      return callback(null, true);
    } else {
      console.log(`❌ CORS: Blocking origin: ${origin}`);
      console.log('📋 Allowed origins:', allowedOrigins);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'Pragma'
  ],
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count',
    'X-Current-Page'
  ]
};

// CORS middleware (adds proper Vary headers and mirrors Origin)
app.use(cors(corsOptions));
// Ensure proxies/CDNs don't cache CORS across different origins
app.use((req, res, next) => {
  res.header('Vary', 'Origin');
  res.append('Vary', 'Access-Control-Request-Method');
  res.append('Vary', 'Access-Control-Request-Headers');
  next();
});
// Generic preflight handler without using wildcard path (avoids path-to-regexp issues)
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', req.get('Origin') || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma');
    res.header('Access-Control-Allow-Credentials', 'true');
    return res.sendStatus(200);
  }
  next();
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined'));

// Static file serving for local uploads (fallback)
app.use('/uploads', express.static('uploads'));

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'MIC Oyo State LMS API Documentation'
}));

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lms';

mongoose.connect(MONGODB_URI)
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  console.log('📝 Note: Backend will run without database. Some features may not work.');
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/modules', moduleRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/forums', forumRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/progress', progressRoutes);

// Health check endpoint with CORS status
app.get('/api/health', (req, res) => {
  const origin = req.get('Origin');
  const isCorsAllowed = !origin || corsOptions.origin(origin, () => true);
  
  res.json({
    status: 'OK',
    message: 'MIC Oyo State LMS Backend is running!',
    timestamp: new Date().toISOString(),
    cors: {
      origin: origin,
      allowed: isCorsAllowed,
      allowedOrigins: allowedOrigins
    }
  });
});

// Email test endpoint
app.get('/api/test-email', async (req, res) => {
  try {
    const { sendEmail } = require('./utils/email');
    
    const testEmail = {
      to: req.query.to || 'test@example.com',
      subject: 'LMS Email Test',
      html: `
        <h2>🎉 Email Test Successful!</h2>
        <p>This is a test email from your MIC LMS Backend.</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</p>
        <hr>
        <p><em>If you received this email, your SMTP configuration is working correctly!</em></p>
      `,
      text: `Email Test Successful!\n\nThis is a test email from your MIC LMS Backend.\nTimestamp: ${new Date().toISOString()}\nEnvironment: ${process.env.NODE_ENV || 'development'}\n\nIf you received this email, your SMTP configuration is working correctly!`
    };

    const result = await sendEmail(testEmail);
    
    if (result.skipped) {
      return res.json({
        success: false,
        message: 'Email transporter not configured. Check your SMTP environment variables.',
        config: {
          SMTP_HOST: process.env.SMTP_HOST,
          SMTP_PORT: process.env.SMTP_PORT,
          SMTP_USER: process.env.SMTP_USER,
          EMAIL_FROM: process.env.EMAIL_FROM,
          hasPassword: !!process.env.SMTP_PASS
        }
      });
    }

    res.json({
      success: true,
      message: 'Test email sent successfully!',
      recipient: testEmail.to,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Email test error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message
    });
  }
});

// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
  res.json({
    success: true,
    message: 'CORS is working correctly!',
    origin: req.get('Origin'),
    timestamp: new Date().toISOString()
  });
});

// CORS error handling middleware
app.use((err, req, res, next) => {
  if (err.message && err.message.includes('CORS')) {
    console.error('🚫 CORS Error:', err.message);
    console.error('🌐 Request Origin:', req.get('Origin'));
    console.error('🔗 Request URL:', req.url);
    console.error('📋 Request Headers:', req.headers);
    
    return res.status(403).json({
      success: false,
      message: 'CORS Error: Origin not allowed',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Origin not allowed',
      origin: req.get('Origin'),
      allowedOrigins: allowedOrigins
    });
  }
  next(err);
});

// General error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(500).json({ 
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5001;
const http = require('http');
const server = http.createServer(app);
const { initSocket } = require('./utils/socket');
const { startDueSoonReminderScheduler } = require('./utils/reminders');
initSocket(server);

server.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 MIC Oyo State LMS Server running on port ${PORT}`);
        console.log(`📚 MIC Oyo State LMS Backend API ready at http://localhost:${PORT}`);
        console.log(`🌐 CORS configured for origins: ${allowedOrigins.join(', ')}`);
        console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`☁️  Render deployment: ${process.env.RENDER ? 'Yes' : 'No'}`);
        // Start schedulers
        startDueSoonReminderScheduler();
});
