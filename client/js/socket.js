/* Thin wrapper around the Socket.IO client connection.
   A single socket connection is reused across the whole app session. */

const SocketClient = (() => {

  let socket = null;


  // =========================
  // CONNECT
  // =========================
  function connect() {

    if (socket) return socket;

    socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10
    });

    return socket;
  }


  // =========================
  // GET SOCKET
  // =========================
  function get() {
    return socket || connect();
  }


  // =========================
  // JOIN ROOM
  // =========================
  function joinRoom(code, role) {

    return new Promise((resolve, reject) => {

      const name =
        sessionStorage.getItem(
          `qd-chat-name-${code}`
        ) || 'Guest';


      get().emit(
        'room:join',
        {
          code,
          role,
          name
        },
        (response) => {

          if (response && response.ok) {

            resolve(response);

          } else {

            reject(
              new Error(
                (response && response.error) ||
                'Unable to join room.'
              )
            );

          }

        }
      );

    });
  }


  // =========================
  // LEAVE ROOM
  // =========================
  function leaveRoom(code) {

    if (!socket) return;

    socket.emit(
      'room:leave',
      {
        code
      }
    );
  }


  // =========================
  // SEND MESSAGE
  // =========================
  function sendMessage(code, text) {

    return new Promise((resolve, reject) => {

      get().emit(
        'message:send',
        {
          code,
          text
        },
        (response) => {

          if (response && response.ok) {

            resolve(
              response.message
            );

          } else {

            reject(
              new Error(
                (response && response.error) ||
                'Unable to send message.'
              )
            );

          }

        }
      );

    });
  }


  // =========================
  // TYPING START
  // =========================
  function startTyping(code) {

    get().emit(
      'typing:start',
      {
        code
      }
    );
  }


  // =========================
  // TYPING STOP
  // =========================
  function stopTyping(code) {

    get().emit(
      'typing:stop',
      {
        code
      }
    );
  }


  // =========================
  // VOICE CALL SIGNAL
  // =========================
  function sendVoiceCallSignal(
    code,
    signal
  ) {

    get().emit(
      'call:voice',
      {
        code,
        signal
      }
    );
  }


  // =========================
  // VIDEO CALL SIGNAL
  // =========================
  function sendVideoCallSignal(
    code,
    signal
  ) {

    get().emit(
      'call:video',
      {
        code,
        signal
      }
    );
  }


  // =========================
  // END CALL
  // =========================
  function endCall(code) {

    get().emit(
      'call:end',
      {
        code
      }
    );
  }


  // =========================
  // EXPORT
  // =========================
  return {

    connect,
    get,
    joinRoom,
    leaveRoom,
    sendMessage,

    startTyping,
    stopTyping,

    sendVoiceCallSignal,
    sendVideoCallSignal,
    endCall

  };

})();
