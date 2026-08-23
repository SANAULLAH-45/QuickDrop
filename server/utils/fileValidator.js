const path = require('path');

// Extensions that are always rejected, regardless of MAX_FILE_SIZE or
// declared mimetype, because they can be executed by common operating
// systems or shells. This is a defense-in-depth denylist; QuickDrop is a
// transfer relay, not a code-execution environment.
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.msp', '.scr', '.sh', '.bash',
  '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.jar',
  '.app', '.deb', '.rpm', '.dmg', '.pkg', '.apk', '.dll', '.so', '.dylib',
  '.gadget', '.workflow', '.action', '.command', '.reg'
]);

// A reasonably broad allowlist covering the file types called out in the
// spec plus common everyday formats. Anything not listed here is still
// permitted as long as it isn't in BLOCKED_EXTENSIONS -- QuickDrop favors
// an extension denylist over a hard allowlist so legitimate files (e.g.
// .csv, .json, .heic) aren't rejected, while known-dangerous types are
// always blocked.
const COMMON_MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.json': 'application/json'
};

/**
 * Strips any directory components and dangerous characters from a
 * user-supplied filename, preventing path traversal (e.g. "../../etc/passwd")
 * and filesystem-unsafe characters. Returns a safe display name; the file
 * is always stored on disk under a server-generated ID, never under the
 * original name, so this sanitized value is for display/download purposes.
 */
function sanitizeFilename(originalName) {
  // path.basename strips any directory traversal segments.
  let name = path.basename(originalName || 'file');

  // Remove control characters and characters that are unsafe across
  // Windows/macOS/Linux filesystems.
  name = name.replace(/[\u0000-\u001f<>:"/\\|?*\u007f]/g, '');

  // Collapse whitespace and trim leading/trailing dots and spaces
  // (Windows disallows trailing dots/spaces).
  name = name.trim().replace(/\.+$/, '').trim();

  if (!name) name = 'file';

  // Guard against absurdly long filenames.
  if (name.length > 200) {
    const ext = path.extname(name);
    name = name.slice(0, 200 - ext.length) + ext;
  }

  return name;
}

/**
 * Returns { valid: boolean, reason?: string } for a given filename.
 */
function validateFile(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { valid: false, reason: `Files of type "${ext}" are not allowed for security reasons.` };
  }

  return { valid: true };
}

function getMimeType(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return COMMON_MIME_TYPES[ext] || 'application/octet-stream';
}

module.exports = { sanitizeFilename, validateFile, getMimeType, BLOCKED_EXTENSIONS };
