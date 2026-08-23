/* Controls the active JustUs chat room:
   chat, room code, QR code, countdown, connection status,
   names, typing indicator, voice call and video call using WebRTC.
*/

const RoomController = (() => {

  let code = null;
  let mySocketId = null;
  let myName = 'You';
  let expiresAt = null;
  let countdownInterval = null;
  let typingTimer = null;

  let knownMessageIds = new Set();

  // =========================
  // WEBRTC
  // =========================

  let peerConnection = null;
  let localStream = null;
  let currentCallType = null;
  let pendingOffer = null;

  const RTC_CONFIG = {
    iceServers: [
      {
        urls: 'stun:stun.l.google.com:19302'
      },
      {
        urls: 'stun:stun1.l.google.com:19302'
      }
    ]
  };

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

    els.callOverlay =
      document.getElementById('callOverlay');

    els.localVideo =
      document.getElementById('localVideo');

    els.remoteVideo =
      document.getElementById('remoteVideo');

    els.callTitle =
      document.getElementById('callTitle');

    els.endCallBtn =
      document.getElementById('endCallBtn');

    els.acceptCallBtn =
      document.getElementById('acceptCallBtn');

    els.rejectCallBtn =
      document.getElementById('rejectCallBtn');
  }


  // =========================
  // INITIALIZE ROOM
  // =========================

  async function init(roomCode) {

    code = Utils.normalizeCode(roomCode);

    myName =
      sessionStorage.getItem(
        `qd-chat-name-${code}`
      ) || 'You';

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


    // Send message

    if (els.textForm) {
      els.textForm.addEventListener(
        'submit',
        onSendText
      );
    }


    // Calls

    setupCalls();


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

      if (joinResponse.name) {
        myName =
          joinResponse.name;
      }

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

      endCurrentCall(false);
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
      ({ connectedUsers, name }) => {

        updateConnectionStatus(
          connectedUsers
        );

        Toast.info(
          `${name || 'Your person'} joined ❤️`
        );
      }
    );


    socket.on(
      'room:user-left',
      ({ connectedUsers }) => {

        updateConnectionStatus(
          connectedUsers
        );

        if (els.typingStatus) {
          els.typingStatus.textContent = '';
        }

        endCurrentCall(false);
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
      'typing:start',
      ({ name }) => {

        if (!els.typingStatus) {
          return;
        }

        els.typingStatus.textContent =
          `${name || 'Your person'} is typing…`;
      }
    );


    socket.on(
      'typing:stop',
      () => {

        if (els.typingStatus) {
          els.typingStatus.textContent = '';
        }
      }
    );


    // Incoming call

    socket.on(
      'call:voice',
      async ({ name, signal }) => {

        await handleIncomingCall(
          'voice',
          name,
          signal
        );
      }
    );


    socket.on(
      'call:video',
      async ({ name, signal }) => {

        await handleIncomingCall(
          'video',
          name,
          signal
        );
      }
    );


    // ICE candidate

    socket.on(
      'call:ice',
      async ({ candidate }) => {

        if (
          !peerConnection ||
          !candidate
        ) {
          return;
        }

        try {

          await peerConnection.addIceCandidate(
            new RTCIceCandidate(candidate)
          );

        } catch (err) {

          console.error(
            'ICE candidate error:',
            err
          );
        }
      }
    );


    // Call answer

    socket.on(
      'call:answer',
      async ({ signal }) => {

        if (!peerConnection || !signal) {
          return;
        }

        try {

          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(signal)
          );

        } catch (err) {

          console.error(
            'Remote answer error:',
            err
          );
        }
      }
    );


    // Call ended

    socket.on(
      'call:end',
      () => {

        endCurrentCall(false);

        Toast.info(
          'Call ended.'
        );
      }
    );


    // Room expired

    socket.on(
      'room:expired',
      ({ code: expiredCode }) => {

        if (
          expiredCode === code
        ) {
          endCurrentCall(false);
          onRoomExpired();
        }
      }
    );


    // Reconnect

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

          endCurrentCall(false);
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

      SocketClient.stopTyping(code);

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

  function hydrateMessages(messages) {

    if (!els.messageList) {
      return;
    }

    els.messageList.innerHTML = '';

    if (
      !messages ||
      messages.length === 0
    ) {

      if (els.messageEmptyState) {

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

  function appendMessage(message) {

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

        <div class="message-name"></div>

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


    const nameElement =
      li.querySelector(
        '.message-name'
      );

    nameElement.textContent =
      message.senderName ||
      (isMine
        ? myName
        : 'Your person');


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


    els.textInput.addEventListener(
      'input',
      () => {

        SocketClient.startTyping(
          code
        );


        clearTimeout(
          typingTimer
        );


        typingTimer =
          setTimeout(
            () => {

              SocketClient.stopTyping(
                code
              );

            },
            1000
          );
      }
    );


    els.textInput.addEventListener(
      'blur',
      () => {

        clearTimeout(
          typingTimer
        );

        SocketClient.stopTyping(
          code
        );
      }
    );
  }


  // =========================
  // CALL SETUP
  // =========================

  function setupCalls() {

    if (els.voiceCallBtn) {

      els.voiceCallBtn.addEventListener(
        'click',
        () => {
          startCall('voice');
        }
      );
    }


    if (els.videoCallBtn) {

      els.videoCallBtn.addEventListener(
        'click',
        () => {
          startCall('video');
        }
      );
    }


    if (els.endCallBtn) {

      els.endCallBtn.addEventListener(
        'click',
        () => {
          endCurrentCall(true);
        }
      );
    }


    if (els.acceptCallBtn) {

      els.acceptCallBtn.addEventListener(
        'click',
        () => {
          acceptIncomingCall();
        }
      );
    }


    if (els.rejectCallBtn) {

      els.rejectCallBtn.addEventListener(
        'click',
        () => {
          rejectIncomingCall();
        }
      );
    }
  }


  // =========================
  // START CALL
  // =========================

  async function startCall(type) {

    if (
      peerConnection ||
      currentCallType
    ) {
      Toast.info(
        'A call is already active.'
      );
      return;
    }

    try {

      currentCallType = type;

      await createPeerConnection();

      localStream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'video'
        });

      localStream
        .getTracks()
        .forEach((track) => {

          peerConnection.addTrack(
            track,
            localStream
          );
        });


      showCallUI(
        type,
        `Calling your person ${type === 'video' ? '📹' : '📞'}`
      );


      const offer =
        await peerConnection.createOffer();

      await peerConnection.setLocalDescription(
        offer
      );


      SocketClient.sendVoiceCallSignal;


      const signal = {
        type: 'offer',
        sdp: peerConnection.localDescription
      };


      if (type === 'voice') {

        SocketClient.sendVoiceCallSignal(
          code,
          signal
        );

      } else {

        SocketClient.sendVideoCallSignal(
          code,
          signal
        );
      }


      Toast.info(
        'Calling your person…'
      );

    } catch (err) {

      console.error(
        'Call start error:',
        err
      );

      endCurrentCall(false);

      Toast.error(
        'Could not access microphone/camera.'
      );
    }
  }


  // =========================
  // CREATE PEER CONNECTION
  // =========================

  async function createPeerConnection() {

    peerConnection =
      new RTCPeerConnection(
        RTC_CONFIG
      );


    peerConnection.onicecandidate =
      (event) => {

        if (!event.candidate) {
          return;
        }

        SocketClient.get().emit(
          'call:ice',
          {
            code,
            candidate: event.candidate
          }
        );
      };


    peerConnection.ontrack =
      (event) => {

        if (
          els.remoteVideo &&
          event.streams &&
          event.streams[0]
        ) {

          els.remoteVideo.srcObject =
            event.streams[0];
        }
      };


    peerConnection.onconnectionstatechange =
      () => {

        if (!peerConnection) {
          return;
        }

        const state =
          peerConnection.connectionState;

        if (
          state === 'connected'
        ) {

          if (els.callTitle) {
            els.callTitle.textContent =
              'Connected ❤️';
          }

        } else if (
          state === 'failed' ||
          state === 'disconnected'
        ) {

          Toast.error(
            'Call connection lost.'
          );

          endCurrentCall(false);
        }
      };
  }


  // =========================
  // INCOMING CALL
  // =========================

  async function handleIncomingCall(
    type,
    name,
    signal
  ) {

    if (
      !signal ||
      signal.type !== 'offer'
    ) {
      return;
    }


    if (
      peerConnection ||
      currentCallType
    ) {

      return;
    }


    pendingOffer = {
      type,
      name: name || 'Your person',
      signal
    };


    showIncomingCallUI(
      type,
      name || 'Your person'
    );
  }


  // =========================
  // ACCEPT CALL
  // =========================

  async function acceptIncomingCall() {

    if (!pendingOffer) {
      return;
    }


    const call =
      pendingOffer;

    pendingOffer = null;

    try {

      currentCallType =
        call.type;


      await createPeerConnection();


      localStream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: call.type === 'video'
        });


      localStream
        .getTracks()
        .forEach((track) => {

          peerConnection.addTrack(
            track,
            localStream
          );
        });


      showCallUI(
        call.type,
        `${call.name} ❤️`
      );


      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(
          call.signal.sdp
        )
      );


      const answer =
        await peerConnection.createAnswer();


      await peerConnection.setLocalDescription(
        answer
      );


      SocketClient.get().emit(
        'call:answer',
        {
          code,
          signal: peerConnection.localDescription
        }
      );


    } catch (err) {

      console.error(
        'Accept call error:',
        err
      );

      endCurrentCall(false);

      Toast.error(
        'Could not answer the call.'
      );
    }
  }


  // =========================
  // REJECT CALL
  // =========================

  function rejectIncomingCall() {

    pendingOffer = null;

    hideCallUI();

    SocketClient.endCall(
      code
    );

    Toast.info(
      'Call declined.'
    );
  }


  // =========================
  // SHOW CALL UI
  // =========================

  function showCallUI(
    type,
    title
  ) {

    if (!els.callOverlay) {
      return;
    }


    els.callOverlay.hidden = false;


    if (els.callTitle) {
      els.callTitle.textContent =
        title;
    }


    if (els.acceptCallBtn) {
      els.acceptCallBtn.hidden =
        true;
    }


    if (els.rejectCallBtn) {
      els.rejectCallBtn.hidden =
        true;
    }


    if (els.endCallBtn) {
      els.endCallBtn.hidden =
        false;
    }


    if (
      els.localVideo
    ) {

      els.localVideo.hidden =
        type !== 'video';

      if (localStream) {

        els.localVideo.srcObject =
          localStream;
      }
    }


    if (
      els.remoteVideo
    ) {

      els.remoteVideo.hidden =
        type !== 'video';
    }
  }


  // =========================
  // INCOMING CALL UI
  // =========================

  function showIncomingCallUI(
    type,
    name
  ) {

    if (!els.callOverlay) {
      return;
    }


    els.callOverlay.hidden =
      false;


    if (els.callTitle) {

      els.callTitle.textContent =
        `${name} is calling ${
          type === 'video'
            ? '📹'
            : '📞'
        }`;
    }


    if (els.acceptCallBtn) {
      els.acceptCallBtn.hidden =
        false;
    }


    if (els.rejectCallBtn) {
      els.rejectCallBtn.hidden =
        false;
    }


    if (els.endCallBtn) {
      els.endCallBtn.hidden =
        true;
    }


    if (els.localVideo) {
      els.localVideo.hidden = true;
    }


    if (els.remoteVideo) {
      els.remoteVideo.hidden =
        type !== 'video';
    }
  }


  // =========================
  // END CALL
  // =========================

  function endCurrentCall(
    notifyPeer = true
  ) {

    if (
      notifyPeer &&
      code
    ) {

      SocketClient.endCall(
        code
      );
    }


    if (localStream) {

      localStream
        .getTracks()
        .forEach(
          (track) => track.stop()
        );

      localStream = null;
    }


    if (peerConnection) {

      peerConnection.close();

      peerConnection = null;
    }


    currentCallType = null;
    pendingOffer = null;


    if (els.localVideo) {
      els.localVideo.srcObject = null;
    }


    if (els.remoteVideo) {
      els.remoteVideo.srcObject = null;
    }


    hideCallUI();
  }


  // =========================
  // HIDE CALL UI
  // =========================

  function hideCallUI() {

    if (els.callOverlay) {
      els.callOverlay.hidden = true;
    }

    if (els.acceptCallBtn) {
      els.acceptCallBtn.hidden = true;
    }

    if (els.rejectCallBtn) {
      els.rejectCallBtn.hidden = true;
    }

    if (els.endCallBtn) {
      els.endCallBtn.hidden = true;
    }
  }


  // =========================
  // TEARDOWN
  // =========================

  function teardown() {

    clearInterval(
      countdownInterval
    );

    clearTimeout(
      typingTimer
    );


    endCurrentCall(
      false
    );


    if (code) {

      SocketClient.stopTyping(
        code
      );

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
      'typing:start',
      'typing:stop',
      'call:voice',
      'call:video',
      'call:ice',
      'call:answer',
      'call:end',
      'room:expired'
    ].forEach(
      (evt) => {
        socket.off(evt);
      }
    );


    code = null;
    mySocketId = null;
    myName = 'You';
    expiresAt = null;
    pendingOffer = null;
  }


  return {
    init,
    teardown
  };

})();
