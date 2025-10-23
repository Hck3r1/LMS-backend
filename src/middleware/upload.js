const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Ensure uploads directory exists
const ensureUploadsDir = () => {
  const uploadsDir = 'uploads';
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Created uploads directory');
  }
};

// Initialize uploads directory
ensureUploadsDir();

// Configure multer for disk storage (local fallback)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadsDir(); // Ensure directory exists before saving
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  // Define allowed file types
  const allowedTypes = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt',
    'application/zip': 'zip',
    'application/x-rar-compressed': 'rar',
    'video/mp4': 'mp4',
    'video/avi': 'avi',
    'video/quicktime': 'mov'
  };

  if (allowedTypes[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
};

// Create multer instance
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: fileFilter
});

// Upload to Cloudinary (primary) with local fallback
const uploadToCloudinary = async (file, folder = 'lms') => {
  try {
    // Check if Cloudinary is configured
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.log('⚠️ Cloudinary not configured, using local storage fallback');
      return {
        success: false,
        error: 'Cloudinary not configured',
        useLocal: true
      };
    }

    // Check if file exists before uploading
    if (!fs.existsSync(file.path)) {
      console.error('File not found:', file.path);
      return {
        success: false,
        error: 'File not found on server',
        useLocal: true
      };
    }

    const result = await cloudinary.uploader.upload(file.path, {
      folder: folder,
      resource_type: 'auto',
      quality: 'auto',
      fetch_format: 'auto'
    });
    
    // Clean up local file after successful upload
    try {
      fs.unlinkSync(file.path);
      console.log('🗑️ Cleaned up local file:', file.path);
    } catch (cleanupError) {
      console.warn('⚠️ Could not clean up local file:', cleanupError.message);
    }
    
    console.log('☁️ File uploaded to Cloudinary:', result.public_id);
    
    return {
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
      format: result.format,
      bytes: result.bytes
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return {
      success: false,
      error: error.message,
      useLocal: true
    };
  }
};

// Multiple file upload middleware
const uploadMultiple = (fieldName, maxCount = 5) => {
  return (req, res, next) => {
    upload.array(fieldName, maxCount)(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      if (!req.files || req.files.length === 0) {
        return next();
      }

      try {
        const uploadPromises = req.files.map(async (file) => {
          const result = await uploadToCloudinary(file, 'lms/uploads');
          
          if (result.success) {
            return {
              filename: file.filename,
              originalName: file.originalname,
              url: result.url,
              publicId: result.public_id,
              fileType: result.format,
              fileSize: result.bytes
            };
          } else {
            // Cloudinary failed, use local storage fallback
            console.log('📁 Using local storage fallback for:', file.originalname);
            const baseUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL?.replace('mic-lms', 'lms-backend-u90k') || 'https://lms-backend-u90k.onrender.com';
            return {
              filename: file.filename,
              originalName: file.originalname,
              url: `${baseUrl}/uploads/${file.filename}`,
              fileType: path.extname(file.originalname).slice(1),
              fileSize: file.size
            };
          }
        });

        req.uploadedFiles = await Promise.all(uploadPromises);
        next();
      } catch (error) {
        console.error('File upload processing error:', error);
        return res.status(500).json({
          success: false,
          message: 'Error processing uploaded files'
        });
      }
    });
  };
};

// Single file upload middleware
const uploadSingle = (fieldName) => {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      if (!req.file) {
        return next();
      }

      try {
        console.log('📤 Processing file upload:', {
          originalName: req.file.originalname,
          filename: req.file.filename,
          size: req.file.size,
          mimetype: req.file.mimetype
        });

        const result = await uploadToCloudinary(req.file, 'lms/uploads');
        
        if (result.success) {
          console.log('☁️ Cloudinary upload successful:', result.url);
          req.uploadedFile = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            url: result.url,
            publicId: result.public_id,
            fileType: result.format,
            fileSize: result.bytes
          };
        } else {
          // Cloudinary failed, use local storage fallback
          console.log('📁 Using local storage fallback for:', req.file.originalname);
          const baseUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL?.replace('mic-lms', 'lms-backend-u90k') || 'https://lms-backend-u90k.onrender.com';
          const finalUrl = `${baseUrl}/uploads/${req.file.filename}`;
          console.log('🔗 Generated local storage URL:', finalUrl);
          req.uploadedFile = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            url: finalUrl,
            fileType: path.extname(req.file.originalname).slice(1),
            fileSize: req.file.size
          };
        }

        next();
      } catch (error) {
        console.error('Single file upload processing error:', error);
        return res.status(500).json({
          success: false,
          message: 'Error processing uploaded file'
        });
      }
    });
  };
};

// Avatar upload middleware (specific for user avatars)
const uploadAvatar = uploadSingle('avatar');

// Course thumbnail upload middleware
const uploadThumbnail = uploadSingle('thumbnail');

// Course banner upload middleware
const uploadBanner = uploadSingle('banner');

// Assignment file upload middleware
const uploadAssignmentFiles = uploadMultiple('files', 10);

// Module content upload middleware
const uploadModuleContent = uploadMultiple('content', 20);

// Delete file from Cloudinary
const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return { success: false, error: error.message };
  }
};

// Error handling middleware for uploads
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 50MB.'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 10 files.'
      });
    }
  }
  
  if (err.message.includes('File type')) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  next(err);
};

module.exports = {
  upload,
  uploadMultiple,
  uploadSingle,
  uploadAvatar,
  uploadThumbnail,
  uploadBanner,
  uploadAssignmentFiles,
  uploadModuleContent,
  uploadToCloudinary,
  deleteFromCloudinary,
  handleUploadError
};
