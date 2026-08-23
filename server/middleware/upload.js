const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { validateFile } = require('../utils/fileValidator');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Files are stored on disk under a random name, never the original
    // filename. This avoids path traversal, collisions, and leaking the
    // original filename structure on the server filesystem.
    const randomName = crypto.randomBytes(20).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomName}${ext}`);
  }
});

function fileFilter(req, file, cb) {
  const check = validateFile(file.originalname);
  if (!check.valid) {
    // Passing an Error into cb triggers Multer's error handling path,
    // which we catch in the error-handling middleware.
    return cb(new Error(check.reason));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 10
  }
});

module.exports = { upload, UPLOADS_DIR, MAX_FILE_SIZE_MB };
