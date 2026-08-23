const multer = require('multer');

/**
 * Catches 404s for unmatched API routes.
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({ error: 'Resource not found.' });
}

/**
 * Central error handler. Multer errors (file too large, too many files)
 * and our own validation errors (bad file type) both arrive here.
 * Never leaks stack traces or filesystem paths to the client.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File exceeds the maximum allowed size.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files in a single upload.' });
    }
    return res.status(400).json({ error: 'Upload failed. Please try again.' });
  }

  if (err && err.message && err.message.toLowerCase().includes('not allowed')) {
    return res.status(400).json({ error: err.message });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
}

module.exports = { notFoundHandler, errorHandler };
