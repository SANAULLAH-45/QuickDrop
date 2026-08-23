const fs = require('fs');
const path = require('path');
const {
  generateUniqueRoomCode,
  generateId
} = require('../utils/codeGenerator');

// Room expiry = 1 hour
const ROOM_EXPIRY_MINUTES = parseInt(
  process.env.ROOM_EXPIRY_MINUTES || '60',
  10
);

const MAX_ROOM_USERS = parseInt(
  process.env.MAX_ROOM_USERS || '2',
  10
);

const UPLOADS_DIR = path.join(
  __dirname,
  '..',
  '..',
  'uploads'
);

/**
 * In-memory room store.
 *
 * JustUs keeps all room state in memory.
 * Rooms are temporary and are deleted when they expire
 * or when the server restarts.
 *
 * Shape of a room:
 * {
 *   code,
 *   createdAt,
 *   expiresAt,
 *   users: Map<socketId, { joinedAt, role, name }>,
 *   messages: [{ id, text, senderId, timestamp, senderName }],
 *   files: []
 * }
 */

const rooms = new Map();


// =========================
// CREATE ROOM
// =========================

function createRoom() {

  const code =
    generateUniqueRoomCode(rooms);

  const now =
    Date.now();

  const room = {

    code,

    createdAt:
      now,

    // 1 hour expiry
    expiresAt:
      now +
      ROOM_EXPIRY_MINUTES *
      60 *
      1000,

    users:
      new Map(),

    messages:
      [],

    files:
      []
  };

  rooms.set(
    code,
    room
  );

  return room;
}


// =========================
// GET ROOM
// =========================

function getRoom(code) {

  if (!code) {
    return null;
  }

  const normalizedCode =
    code.toUpperCase();

  const room =
    rooms.get(
      normalizedCode
    );

  if (!room) {
    return null;
  }

  if (isExpired(room)) {

    deleteRoom(
      normalizedCode
    );

    return null;
  }

  return room;
}


// =========================
// CHECK EXPIRY
// =========================

function isExpired(room) {

  return Date.now() >=
    room.expiresAt;
}


// =========================
// CHECK ROOM FULL
// =========================

function roomIsFull(room) {

  return room.users.size >=
    MAX_ROOM_USERS;
}


// =========================
// ADD USER
// =========================

function addUser(
  room,
  socketId,
  role,
  name = 'Guest'
) {

  room.users.set(
    socketId,
    {
      joinedAt:
        Date.now(),

      role,

      name
    }
  );
}


// =========================
// REMOVE USER
// =========================

function removeUser(
  room,
  socketId
) {

  room.users.delete(
    socketId
  );
}


// =========================
// ADD MESSAGE
// =========================

function addMessage(
  room,
  text,
  senderId
) {

  const user =
    room.users.get(
      senderId
    );

  const message = {

    id:
      generateId(8),

    text,

    senderId,

    senderName:
      user?.name ||
      'Guest',

    timestamp:
      Date.now()
  };

  room.messages.push(
    message
  );

  return message;
}


// =========================
// ADD FILE
// =========================

function addFile(
  room,
  fileMeta
) {

  room.files.push(
    fileMeta
  );

  return fileMeta;
}


// =========================
// REMOVE FILE
// =========================

function removeFile(
  room,
  fileId
) {

  const idx =
    room.files.findIndex(
      (f) =>
        f.id === fileId
    );

  if (idx === -1) {
    return null;
  }

  const [file] =
    room.files.splice(
      idx,
      1
    );

  deleteFileFromDisk(
    file.storedName
  );

  return file;
}


// =========================
// DELETE FILE
// =========================

function deleteFileFromDisk(
  storedName
) {

  if (!storedName) {
    return;
  }

  const filePath =
    path.join(
      UPLOADS_DIR,
      storedName
    );

  fs.unlink(
    filePath,
    (err) => {

      // File already deleted
      if (
        err &&
        err.code !== 'ENOENT'
      ) {

        console.error(
          `Failed to delete file ${storedName}:`,
          err.message
        );
      }
    }
  );
}


// =========================
// DELETE ROOM
// =========================

function deleteRoom(
  code
) {

  const room =
    rooms.get(code);

  if (!room) {
    return;
  }

  for (
    const file of room.files
  ) {

    deleteFileFromDisk(
      file.storedName
    );
  }

  rooms.delete(
    code
  );
}


// =========================
// CLEAN EXPIRED ROOMS
// =========================

function sweepExpiredRooms() {

  const deleted = [];

  for (
    const [code, room]
    of rooms.entries()
  ) {

    if (
      isExpired(room)
    ) {

      deleteRoom(
        code
      );

      deleted.push(
        code
      );
    }
  }

  return deleted;
}


// =========================
// PUBLIC ROOM VIEW
// =========================

function getPublicRoomView(
  room
) {

  return {

    code:
      room.code,

    createdAt:
      room.createdAt,

    expiresAt:
      room.expiresAt,

    connectedUsers:
      room.users.size,

    messages:
      room.messages,

    files:
      room.files.map(
        publicFileView
      )
  };
}


// =========================
// PUBLIC FILE VIEW
// =========================

function publicFileView(
  file
) {

  return {

    id:
      file.id,

    name:
      file.safeName,

    size:
      file.size,

    mimeType:
      file.mimeType,

    uploadedAt:
      file.uploadedAt
  };
}


// =========================
// EXPORT
// =========================

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
