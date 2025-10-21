const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// CORS configuration with support for localhost, tunnels (ngrok/grok), and Render
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'https://localhost:3000',
  'https://localhost:3001',
  'https://localhost:3002',
  'https://lms-backend-u90k.onrender.com',
  'https://mic-lms.vercel.app'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests or same-origin
    if (!origin) return callback(null, true);

    const isAllowedList = allowedOrigins.includes(origin);
    const isNgrok = /\.ngrok-free\.app$/i.test(origin) || /\.ngrok\.io$/i.test(origin);
    const isGrok = /\.grok$/i.test(origin) || /\.trycloudflare\.com$/i.test(origin);
    const isRender = /\.onrender\.com$/i.test(origin);

    if (isAllowedList || isNgrok || isGrok || isRender) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  optionsSuccessStatus: 204
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined'));

// Static file serving for uploads
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

// Health check endpoint
app.get('/api/health', (req, res) => {
        res.json({
          status: 'OK',
          message: 'MIC Oyo State LMS Backend is running!',
          timestamp: new Date().toISOString()
        });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
const http = require('http');
const server = http.createServer(app);
const { initSocket } = require('./utils/socket');
const { startDueSoonReminderScheduler } = require('./utils/reminders');
initSocket(server);

server.listen(PORT, () => {
        console.log(`🚀 MIC Oyo State LMS Server running on port ${PORT}`);
        console.log(`📚 MIC Oyo State LMS Backend API ready at http://localhost:${PORT}`);
        // Start schedulers
        startDueSoonReminderScheduler();
});
