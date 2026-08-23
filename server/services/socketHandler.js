const roomService = require('./roomService');

// =========================
// MESSAGE RATE LIMIT
// =========================

const MESSAGE_WINDOW_MS = 10 * 1000;
const MAX_MESSAGES_PER_WINDOW = 30;

const messageCounters = new Map();


function isMessageRateLimited(socketId) {

  const now = Date.now();

  let counter =
    messageCounters.get(socketId);

  if (
    !counter ||
    now - counter.windowStart >
      MESSAGE_WINDOW_MS
  ) {

    counter = {
      count: 0,
      windowStart: now
    };
  }

  counter.count += 1;

  messageCounters.set(
    socketId,
    counter
  );

  return (
    counter.count >
    MAX_MESSAGES_PER_WINDOW
  );
}


// =========================
// REGISTER SOCKET HANDLERS
// =========================

function registerSocketHandlers(io) {

  io.on('connection', (socket) => {

    let currentRoomCode = null;


    // =========================
    // JOIN ROOM
    // =========================

    socket.on(
      'room:join',
      ({ code, role, name }, ack) => {

        const room =
          roomService.getRoom(code);

        if (!room) {

          return ack && ack({
            ok: false,
            error:
              'This room does not exist or has expired.'
          });
        }


        if (
          roomService.roomIsFull(room) &&
          !room.users.has(socket.id)
        ) {

          return ack && ack({
            ok: false,
            error:
              'This room already has two participants.'
          });
        }


        socket.join(room.code);

        currentRoomCode =
          room.code;


        roomService.addUser(
          room,
          socket.id,
          role === 'creator'
            ? 'creator'
            : 'joiner'
        );


        socket.chatName =
          (name || '')
            .toString()
            .trim()
            .slice(0, 30) ||
          (
            role === 'creator'
              ? 'You'
              : 'Guest'
          );


        const user =
          room.users.get(socket.id);

        if (user) {
          user.name =
            socket.chatName;
        }


        // Tell other participant
        socket.to(room.code).emit(
          'room:user-joined',
          {
            connectedUsers:
              room.users.size,

            name:
              socket.chatName
          }
        );


        ack && ack({

          ok: true,

          room:
            roomService.getPublicRoomView(
              room
            ),

          socketId:
            socket.id,

          name:
            socket.chatName
        });
      }
    );


    // =========================
    // SEND MESSAGE
    // =========================

    socket.on(
      'message:send',
      ({ code, text }, ack) => {

        const room =
          roomService.getRoom(code);

        if (!room) {

          return ack && ack({
            ok: false,
            error:
              'This room does not exist or has expired.'
          });
        }


        if (!room.users.has(socket.id)) {

          return ack && ack({
            ok: false,
            error:
              'You are not connected to this room.'
          });
        }


        if (
          isMessageRateLimited(
            socket.id
          )
        ) {

          return ack && ack({
            ok: false,
            error:
              'You are sending messages too quickly.'
          });
        }


        const trimmed =
          (text || '')
            .toString()
            .trim();


        if (!trimmed) {

          return ack && ack({
            ok: false,
            error:
              'Message cannot be empty.'
          });
        }


        if (trimmed.length > 5000) {

          return ack && ack({
            ok: false,
            error:
              'Message is too long (max 5000 characters).'
          });
        }


        const message =
          roomService.addMessage(
            room,
            trimmed,
            socket.id
          );


        message.senderName =
          socket.chatName ||
          'Guest';


        io.to(room.code).emit(
          'message:receive',
          message
        );


        ack && ack({
          ok: true,
          message
        });
      }
    );


    // =========================
    // TYPING START
    // =========================

    socket.on(
      'typing:start',
      ({ code }) => {

        const room =
          roomService.getRoom(code);

        if (
          !room ||
          !room.users.has(socket.id)
        ) {
          return;
        }


        socket.to(room.code).emit(
          'typing:start',
          {
            name:
              socket.chatName ||
              'Someone'
          }
        );
      }
    );


    // =========================
    // TYPING STOP
    // =========================

    socket.on(
      'typing:stop',
      ({ code }) => {

        const room =
          roomService.getRoom(code);

        if (
          !room ||
          !room.users.has(socket.id)
        ) {
          return;
        }


        socket.to(room.code).emit(
          'typing:stop'
        );
      }
    );


    // =========================
    // VOICE CALL
    // =========================

    socket.on(
      'call:voice',
      ({ code, signal }) => {

        const room =
          roomService.getRoom(code);

        if (
          !room ||
          !room.users.has(socket.id)
        ) {
          return;
        }


        socket.to(room.code).emit(
          'call:voice',
          {
            from:
              socket.id,

            name:
              socket.chatName ||
              'Someone',

            signal
          }
        );
      }
    );


    // =========================
    // VIDEO CALL
    // =========================

    socket.on(
      'call:video',
      ({ code, signal }) => {

        const room =
          roomService.getRoom(code);

        if (
          !room ||
          !room.users.has(socket.id)
        ) {
          return;
        }


        socket.to(room.code).emit(
          'call:video',
          {
            from:
              socket.id,

            name:
              socket.chatName ||
              'Someone',

            signal
          }
        );
      }
    );


    // =========================
    // WEBRTC ICE CANDIDATE
    // =========================

    socket.on(
      'call:ice',
      ({ code, candidate }) => {

        const room =
          roomService.getRoom(code);

        if (
          !room ||
          !room.users.has(socket.id)
        ) {
          return;
        }


        if (!candidate) {
          return;
        }


        // Forward ICE candidate
        // to the other participant
        socket.to(room.code).emit(
          'call:ice',
          {
            from:
              socket.id,

            candidate
          }
        );
      }
    );


    // =========================
    // END CALL
    // =========================

    socket.on(
      'call:end',
      ({ code }) => {

        const room =
          roomService.getRoom(code);

        if (
          !room ||
          !room.users.has(socket.id)
        ) {
          return;
        }


        socket.to(room.code).emit(
          'call:end'
        );
      }
    );


    // =========================
    // LEAVE ROOM
    // =========================

    socket.on(
      'room:leave',
      ({ code }) => {

        handleLeave(
          socket,
          code,
          io
        );
      }
    );


    // =========================
    // DISCONNECT
    // =========================

    socket.on(
      'disconnect',
      () => {

        messageCounters.delete(
          socket.id
        );


        if (currentRoomCode) {

          handleLeave(
            socket,
            currentRoomCode,
            io
          );
        }
      }
    );

  });
}


// =========================
// HANDLE LEAVE
// =========================

function handleLeave(
  socket,
  code,
  io
) {

  const room =
    roomService.getRoom(code);

  if (!room) {
    return;
  }


  roomService.removeUser(
    room,
    socket.id
  );


  socket.leave(
    room.code
  );


  socket.to(room.code).emit(
    'room:user-left',
    {
      connectedUsers:
        room.users.size
    }
  );


  socket.to(room.code).emit(
    'typing:stop'
  );


  socket.to(room.code).emit(
    'call:end'
  );
}


module.exports = {
  registerSocketHandlers
};
