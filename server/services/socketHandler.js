const roomService = require('./roomService');

// Simple per-socket rate limiting for chat messages, to prevent a runaway
// client from flooding a room.
const MESSAGE_WINDOW_MS = 10 * 1000;
const MAX_MESSAGES_PER_WINDOW = 30;
const messageCounters = new Map(); // socketId -> { count, windowStart }

function isMessageRateLimited(socketId) {
  const now = Date.now();
  let counter = messageCounters.get(socketId);
  if (!counter || now - counter.windowStart > MESSAGE_WINDOW_MS) {
    counter = { count: 0, windowStart: now };
  }
  counter.count += 1;
  messageCounters.set(socketId, counter);
  return counter.count > MAX_MESSAGES_PER_WINDOW;
}

/**
 * Wires up all Socket.IO event handling. Called once from server.js with
 * the shared `io` instance.
 */
function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    let currentRoomCode = null;

    socket.on('room:join', ({ code, role }, ack) => {
      const room = roomService.getRoom(code);

      if (!room) {
        return ack && ack({ ok: false, error: 'This room does not exist or has expired.' });
      }

      if (roomService.roomIsFull(room) && !room.users.has(socket.id)) {
        return ack && ack({ ok: false, error: 'This room already has two participants.' });
      }

      socket.join(room.code);
      currentRoomCode = room.code;
      roomService.addUser(room, socket.id, role === 'creator' ? 'creator' : 'joiner');

      // Let everyone else in the room know someone connected.
      socket.to(room.code).emit('room:user-joined', {
        connectedUsers: room.users.size
      });

      ack && ack({
        ok: true,
        room: roomService.getPublicRoomView(room),
        socketId: socket.id
      });
    });

    socket.on('message:send', ({ code, text }, ack) => {
      const room = roomService.getRoom(code);
      if (!room) {
        return ack && ack({ ok: false, error: 'This room does not exist or has expired.' });
      }
      if (!room.users.has(socket.id)) {
        return ack && ack({ ok: false, error: 'You are not connected to this room.' });
      }
      if (isMessageRateLimited(socket.id)) {
        return ack && ack({ ok: false, error: 'You are sending messages too quickly.' });
      }

      const trimmed = (text || '').toString().trim();
      if (!trimmed) {
        return ack && ack({ ok: false, error: 'Message cannot be empty.' });
      }
      if (trimmed.length > 5000) {
        return ack && ack({ ok: false, error: 'Message is too long (max 5000 characters).' });
      }

      const message = roomService.addMessage(room, trimmed, socket.id);

      io.to(room.code).emit('message:receive', message);
      ack && ack({ ok: true, message });
    });

    socket.on('room:leave', ({ code }) => {
      handleLeave(socket, code, io);
    });

    socket.on('disconnect', () => {
      messageCounters.delete(socket.id);
      if (currentRoomCode) {
        handleLeave(socket, currentRoomCode, io);
      }
    });
  });
}

function handleLeave(socket, code, io) {
  const room = roomService.getRoom(code);
  if (!room) return;

  roomService.removeUser(room, socket.id);
  socket.leave(room.code);
  socket.to(room.code).emit('room:user-left', {
    connectedUsers: room.users.size
  });
}

module.exports = { registerSocketHandlers };
