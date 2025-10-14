const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for local storage (fallback)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
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

// Upload to Cloudinary
const uploadToCloudinary = async (file, folder = 'lms') => {
  try {
    const result = await cloudinary.uploader.upload(file.path, {
      folder: folder,
      resource_type: 'auto',
      quality: 'auto',
      fetch_format: 'auto'
    });
    
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
      error: error.message
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
            // Fallback to local storage if Cloudinary fails
            return {
              filename: file.filename,
              originalName: file.originalname,
              url: `/uploads/${file.filename}`,
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
        const result = await uploadToCloudinary(req.file, 'lms/uploads');
        
        if (result.success) {
          req.uploadedFile = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            url: result.url,
            publicId: result.public_id,
            fileType: result.format,
            fileSize: result.bytes
          };
        } else {
          // Fallback to local storage
          req.uploadedFile = {
            filename: req.file.filename,
            originalName: req.file.originalname,
            url: `/uploads/${req.file.filename}`,
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
