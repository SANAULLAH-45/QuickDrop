/* Controls the active JustUs chat room:
   chat, room code, QR code, countdown, connection status,
   names, and real-time messages.
*/

const RoomController = (() => {

  let code = null;
  let mySocketId = null;
  let expiresAt = null;
  let countdownInterval = null;

  let knownMessageIds = new Set();

  const els = {};


  // =========================
  // CACHE HTML ELEMENTS
  // =========================
  function cacheEls() {

    els.roomCodeText =
      document.getElementById('roomCodeText');

    els.copyCodeBtn =
      document.getElementById('copyCodeBtn');

    els.connectionDot =
      document.getElementById('connectionDot');

    els.connectionText =
      document.getElementById('connectionText');

    els.timerText =
      document.getElementById('timerText');

    els.qrCode =
      document.getElementById('qrCode');

    els.textForm =
      document.getElementById('textForm');

    els.textInput =
      document.getElementById('textInput');

    els.messageList =
      document.getElementById('messageList');

    els.messageEmptyState =
      document.getElementById('messageEmptyState');

    els.typingStatus =
      document.getElementById('typingStatus');

    els.voiceCallBtn =
      document.getElementById('voiceCallBtn');

    els.videoCallBtn =
      document.getElementById('videoCallBtn');
  }


  // =========================
  // INITIALIZE ROOM
  // =========================
  async function init(roomCode) {

    code = Utils.normalizeCode(roomCode);

    cacheEls();

    knownMessageIds = new Set();

    if (els.roomCodeText) {
      els.roomCodeText.textContent = code;
    }

    renderQrCode();


    // Copy code
    if (els.copyCodeBtn) {
      els.copyCodeBtn.addEventListener(
        'click',
        onCopyCode
      );
    }


    // Text message
    if (els.textForm) {
      els.textForm.addEventListener(
        'submit',
        onSendText
      );
    }


    // Voice call button
    if (els.voiceCallBtn) {
      els.voiceCallBtn.addEventListener(
        'click',
        () => {
          Toast.info(
            'Voice calling will be added next.'
          );
        }
      );
    }


    // Video call button
    if (els.videoCallBtn) {
      els.videoCallBtn.addEventListener(
        'click',
        () => {
          Toast.info(
            'Video calling will be added next.'
          );
        }
      );
    }


    // Get room information
    try {

      const roomState =
        await Api.getRoom(code);

      expiresAt =
        roomState.expiresAt;

      hydrateMessages(
        roomState.messages
      );

      startCountdown();

    } catch (err) {

      Router.navigate('/expired');
      return;
    }


    // Join Socket.IO room
    try {

      const role =
        sessionStorage.getItem(
          `qd-creator-${code}`
        )
          ? 'creator'
          : 'joiner';

      const joinResponse =
        await SocketClient.joinRoom(
          code,
          role
        );

      mySocketId =
        joinResponse.socketId;

      updateConnectionStatus(
        joinResponse.room.connectedUsers
      );

    } catch (err) {

      Toast.error(
        err.message ||
        'Could not connect to chat.'
      );

      Router.navigate('/expired');
      return;
    }


    bindSocketEvents();

    setupTyping();
  }


  // =========================
  // QR CODE
  // =========================
  function renderQrCode() {

    if (!els.qrCode) return;

    els.qrCode.innerHTML = '';

    const joinUrl =
      `${window.location.origin}/#/room/${code}`;

    // QRCode library loaded from index.html
    new QRCode(els.qrCode, {
      text: joinUrl,
      width: 148,
      height: 148,
      colorDark: '#0C0F14',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }


  // =========================
  // COPY CODE
  // =========================
  function onCopyCode() {

    Utils.copyToClipboard(code)
      .then((ok) => {

        if (ok) {
          Toast.success(
            'Chat code copied'
          );
        } else {
          Toast.error(
            'Could not copy code'
          );
        }

      });
  }


  // =========================
  // COUNTDOWN
  // =========================
  function startCountdown() {

    clearInterval(
      countdownInterval
    );

    updateCountdownDisplay();

    countdownInterval =
      setInterval(
        updateCountdownDisplay,
        1000
      );
  }


  function updateCountdownDisplay() {

    if (!expiresAt || !els.timerText) {
      return;
    }

    const remaining =
      new Date(expiresAt).getTime()
      - Date.now();

    if (remaining <= 0) {

      clearInterval(
        countdownInterval
      );

      onRoomExpired();
      return;
    }

    els.timerText.textContent =
      Utils.formatCountdown(
        remaining
      );

    els.timerText.classList.toggle(
      'warn',
      remaining <
        5 * 60 * 1000 &&
      remaining >=
        60 * 1000
    );

    els.timerText.classList.toggle(
      'danger',
      remaining <
        60 * 1000
    );
  }


  function onRoomExpired() {

    Toast.warn(
      'This chat has expired.'
    );

    Router.navigate(
      '/expired'
    );
  }


  // =========================
  // CONNECTION STATUS
  // =========================
  function updateConnectionStatus(
    connectedUsers
  ) {

    if (
      !els.connectionDot ||
      !els.connectionText
    ) {
      return;
    }

    const otherPresent =
      connectedUsers >= 2;

    els.connectionDot.classList.toggle(
      'online',
      otherPresent
    );

    els.connectionText.textContent =
      otherPresent
        ? 'Connected — your person is here ❤️'
        : 'Waiting for your person… ❤️';
  }


  // =========================
  // SOCKET EVENTS
  // =========================
  function bindSocketEvents() {

    const socket =
      SocketClient.get();

    socket.on(
      'room:user-joined',
      ({ connectedUsers }) => {

        updateConnectionStatus(
          connectedUsers
        );

        Toast.info(
          'Your person joined ❤️'
        );
      }
    );


    socket.on(
      'room:user-left',
      ({ connectedUsers }) => {

        updateConnectionStatus(
          connectedUsers
        );
      }
    );


    socket.on(
      'message:receive',
      (message) => {

        appendMessage(
          message
        );
      }
    );


    socket.on(
      'room:expired',
      ({ code: expiredCode }) => {

        if (
          expiredCode === code
        ) {
          onRoomExpired();
        }
      }
    );


    socket.io.on(
      'reconnect',
      async () => {

        try {

          const role =
            sessionStorage.getItem(
              `qd-creator-${code}`
            )
              ? 'creator'
              : 'joiner';

          const joinResponse =
            await SocketClient.joinRoom(
              code,
              role
            );

          mySocketId =
            joinResponse.socketId;

          updateConnectionStatus(
            joinResponse.room.connectedUsers
          );

          Toast.success(
            'Reconnected ❤️'
          );

        } catch (err) {

          onRoomExpired();
        }
      }
    );
  }


  // =========================
  // SEND MESSAGE
  // =========================
  async function onSendText(e) {

    e.preventDefault();

    if (!els.textInput) {
      return;
    }

    const text =
      els.textInput.value.trim();

    if (!text) {
      return;
    }

    const btn =
      document.getElementById(
        'sendTextBtn'
      );

    if (btn) {
      btn.disabled = true;
    }

    try {

      await SocketClient.sendMessage(
        code,
        text
      );

      els.textInput.value = '';

    } catch (err) {

      Toast.error(
        err.message ||
        'Message could not be sent.'
      );

    } finally {

      if (btn) {
        btn.disabled = false;
      }

      els.textInput.focus();
    }
  }


  // =========================
  // LOAD OLD MESSAGES
  // =========================
  function hydrateMessages(
    messages
  ) {

    if (!els.messageList) {
      return;
    }

    els.messageList.innerHTML = '';

    if (
      !messages ||
      messages.length === 0
    ) {

      if (
        els.messageEmptyState
      ) {

        els.messageList.appendChild(
          els.messageEmptyState
        );
      }

      return;
    }

    messages.forEach(
      appendMessage
    );
  }


  // =========================
  // DISPLAY MESSAGE
  // =========================
  function appendMessage(
    message
  ) {

    if (
      !els.messageList ||
      !message
    ) {
      return;
    }

    if (
      knownMessageIds.has(
        message.id
      )
    ) {
      return;
    }

    knownMessageIds.add(
      message.id
    );


    if (
      els.messageEmptyState &&
      els.messageEmptyState.parentElement
    ) {

      els.messageEmptyState.remove();
    }


    const li =
      document.createElement(
        'li'
      );


    const isMine =
      message.senderId ===
      mySocketId;


    li.className =
      'message-item' +
      (isMine ? ' mine' : '');


    li.innerHTML = `

      <div class="message-bubble">

        <div class="message-text"></div>

        <div class="message-meta">

          <span class="message-time">
            ${Utils.formatTime(
              message.timestamp
            )}
          </span>

          <button
            class="copy-text-btn"
            type="button"
          >
            Copy
          </button>

        </div>

      </div>

    `;


    const textElement =
      li.querySelector(
        '.message-text'
      );


    textElement.textContent =
      message.text;


    const copyButton =
      li.querySelector(
        '.copy-text-btn'
      );


    copyButton.addEventListener(
      'click',
      () => {

        Utils.copyToClipboard(
          message.text
        ).then((ok) => {

          if (ok) {
            Toast.success(
              'Message copied'
            );
          }

        });
      }
    );


    els.messageList.appendChild(
      li
    );


    els.messageList.scrollTop =
      els.messageList.scrollHeight;
  }


  // =========================
  // TYPING INDICATOR
  // =========================
  function setupTyping() {

    if (!els.textInput) {
      return;
    }

    let typingTimer = null;

    els.textInput.addEventListener(
      'input',
      () => {

        clearTimeout(
          typingTimer
        );

        // Typing event will be connected
        // to Socket.IO when the server
        // supports it.

        typingTimer =
          setTimeout(
            () => {},
            700
          );
      }
    );
  }


  // =========================
  // TEARDOWN
  // =========================
  function teardown() {

    clearInterval(
      countdownInterval
    );

    if (code) {
      SocketClient.leaveRoom(
        code
      );
    }

    const socket =
      SocketClient.get();

    [
      'room:user-joined',
      'room:user-left',
      'message:receive',
      'room:expired'
    ].forEach(
      (evt) => {
        socket.off(evt);
      }
    );

    code = null;
    mySocketId = null;
    expiresAt = null;
  }


  return {
    init,
    teardown
  };

})();
