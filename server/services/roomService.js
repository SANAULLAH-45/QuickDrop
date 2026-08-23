const fs = require('fs');
const path = require('path');
const { generateUniqueRoomCode, generateId } = require('../utils/codeGenerator');

const ROOM_EXPIRY_MINUTES = parseInt(process.env.ROOM_EXPIRY_MINUTES || '15', 10);
const MAX_ROOM_USERS = parseInt(process.env.MAX_ROOM_USERS || '2', 10);
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

/**
 * In-memory room store.
 *
 * QuickDrop intentionally keeps all room state in memory (a Map), never in
 * a database: rooms are ephemeral by design, contain no accounts or
 * personal data, and are wiped on expiry or server restart. This keeps the
 * "no data persistence" security property simple to reason about.
 *
 * Shape of a room:
 * {
 *   code, createdAt, expiresAt,
 *   users: Map<socketId, { joinedAt, role }>,
 *   messages: [{ id, text, senderId, timestamp }],
 *   files: [{ id, originalName, safeName, storedName, size, mimeType, uploadedAt, senderId }]
 * }
 */
const rooms = new Map();

function createRoom() {
  const code = generateUniqueRoomCode(rooms);
  const now = Date.now();
  const room = {
    code,
    createdAt: now,
    expiresAt: now + ROOM_EXPIRY_MINUTES * 60 * 1000,
    users: new Map(),
    messages: [],
    files: []
  };
  rooms.set(code, room);
  return room;
}

function getRoom(code) {
  if (!code) return null;
  const room = rooms.get(code.toUpperCase());
  if (!room) return null;
  if (isExpired(room)) {
    deleteRoom(code.toUpperCase());
    return null;
  }
  return room;
}

function isExpired(room) {
  return Date.now() >= room.expiresAt;
}

function roomIsFull(room) {
  return room.users.size >= MAX_ROOM_USERS;
}

function addUser(room, socketId, role) {
  room.users.set(socketId, { joinedAt: Date.now(), role });
}

function removeUser(room, socketId) {
  room.users.delete(socketId);
}

function addMessage(room, text, senderId) {
  const message = {
    id: generateId(8),
    text,
    senderId,
    timestamp: Date.now()
  };
  room.messages.push(message);
  return message;
}

function addFile(room, fileMeta) {
  room.files.push(fileMeta);
  return fileMeta;
}

function removeFile(room, fileId) {
  const idx = room.files.findIndex((f) => f.id === fileId);
  if (idx === -1) return null;
  const [file] = room.files.splice(idx, 1);
  deleteFileFromDisk(file.storedName);
  return file;
}

function deleteFileFromDisk(storedName) {
  if (!storedName) return;
  const filePath = path.join(UPLOADS_DIR, storedName);
  fs.unlink(filePath, (err) => {
    // ENOENT (already gone) is fine; anything else is worth logging.
    if (err && err.code !== 'ENOENT') {
      console.error(`Failed to delete file ${storedName}:`, err.message);
    }
  });
}

function deleteRoom(code) {
  const room = rooms.get(code);
  if (!room) return;
  for (const file of room.files) {
    deleteFileFromDisk(file.storedName);
  }
  rooms.delete(code);
}

/**
 * Sweeps all rooms and deletes any that have expired. Intended to be run
 * on an interval by the cleanup service.
 * @returns {string[]} codes of rooms that were deleted
 */
function sweepExpiredRooms() {
  const deleted = [];
  for (const [code, room] of rooms.entries()) {
    if (isExpired(room)) {
      deleteRoom(code);
      deleted.push(code);
    }
  }
  return deleted;
}

function getPublicRoomView(room) {
  return {
    code: room.code,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    connectedUsers: room.users.size,
    messages: room.messages,
    files: room.files.map(publicFileView)
  };
}

function publicFileView(file) {
  return {
    id: file.id,
    name: file.safeName,
    size: file.size,
    mimeType: file.mimeType,
    uploadedAt: file.uploadedAt
  };
}

module.exports = {
  rooms,
  createRoom,
  getRoom,
  isExpired,
  roomIsFull,
  addUser,
  removeUser,
  addMessage,
  addFile,
  removeFile,
  deleteRoom,
  sweepExpiredRooms,
  getPublicRoomView,
  publicFileView,
  MAX_ROOM_USERS,
  ROOM_EXPIRY_MINUTES
};
