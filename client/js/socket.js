/* Thin wrapper around the Socket.IO client connection. A single socket
   connection is reused across the whole app session. */

const SocketClient = (() => {
  let socket = null;

  function connect() {
    if (socket) return socket;
    socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10
    });
    return socket;
  }

  function get() {
    return socket || connect();
  }

  function joinRoom(code, role) {
    return new Promise((resolve, reject) => {
      get().emit('room:join', { code, role }, (response) => {
        if (response && response.ok) {
          resolve(response);
        } else {
          reject(new Error((response && response.error) || 'Unable to join room.'));
        }
      });
    });
  }

  function leaveRoom(code) {
    if (socket) socket.emit('room:leave', { code });
  }

  function sendMessage(code, text) {
    return new Promise((resolve, reject) => {
      get().emit('message:send', { code, text }, (response) => {
        if (response && response.ok) {
          resolve(response.message);
        } else {
          reject(new Error((response && response.error) || 'Unable to send message.'));
        }
      });
    });
  }

  return { connect, get, joinRoom, leaveRoom, sendMessage };
})();
