const path = require('path');
const fs = require('fs');
const roomService = require('../services/roomService');
const { sanitizeFilename, getMimeType } = require('../utils/fileValidator');
const { UPLOADS_DIR } = require('../middleware/upload');

/**
 * POST /api/rooms
 * Creates a new room and returns its code + expiry.
 */
function createRoom(req, res) {
  const room = roomService.createRoom();
  res.status(201).json({
    code: room.code,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    expiryMinutes: roomService.ROOM_EXPIRY_MINUTES
  });
}

/**
 * GET /api/rooms/:code
 * Validates a room code and, if it exists, returns its current public state.
 */
function getRoom(req, res) {
  const { code } = req.params;
  const room = roomService.getRoom(code);

  if (!room) {
    return res.status(404).json({ error: 'This room does not exist or has expired.' });
  }

  res.json(roomService.getPublicRoomView(room));
}

/**
 * POST /api/rooms/:code/files
 * Handles a (already-multer-processed) file upload into a room.
 */
function uploadFile(req, res) {
  const { code } = req.params;
  const room = roomService.getRoom(code);

  if (!room) {
    // Clean up anything multer already wrote to disk since the room is gone.
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'This room does not exist or has expired.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file was received.' });
  }

  const safeName = sanitizeFilename(req.file.originalname);
  const fileMeta = {
    id: require('../utils/codeGenerator').generateId(8),
    originalName: req.file.originalname,
    safeName,
    storedName: req.file.filename,
    size: req.file.size,
    mimeType: getMimeType(safeName),
    uploadedAt: Date.now(),
    senderId: req.body.senderId || null
  };

  roomService.addFile(room, fileMeta);

  const io = req.app.get('io');
  io.to(room.code).emit('file:available', {
    ...roomService.publicFileView(fileMeta),
    senderId: fileMeta.senderId
  });

  res.status(201).json(roomService.publicFileView(fileMeta));
}

/**
 * GET /api/rooms/:code/files/:fileId
 * Streams a previously uploaded file back to the requester.
 */
function downloadFile(req, res) {
  const { code, fileId } = req.params;
  const room = roomService.getRoom(code);

  if (!room) {
    return res.status(404).json({ error: 'This room does not exist or has expired.' });
  }

  const file = room.files.find((f) => f.id === fileId);
  if (!file) {
    return res.status(404).json({ error: 'File not found in this room.' });
  }

  const filePath = path.join(UPLOADS_DIR, file.storedName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File is no longer available.' });
  }

  res.download(filePath, file.safeName, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Failed to download file.' });
    }
  });
}

/**
 * DELETE /api/rooms/:code/files/:fileId
 * Removes a file from a room (sender-initiated retraction).
 */
function deleteFile(req, res) {
  const { code, fileId } = req.params;
  const room = roomService.getRoom(code);

  if (!room) {
    return res.status(404).json({ error: 'This room does not exist or has expired.' });
  }

  const removed = roomService.removeFile(room, fileId);
  if (!removed) {
    return res.status(404).json({ error: 'File not found in this room.' });
  }

  const io = req.app.get('io');
  io.to(room.code).emit('file:deleted', { fileId });

  res.json({ success: true, fileId });
}

module.exports = { createRoom, getRoom, uploadFile, downloadFile, deleteFile };
