/* Controls the active JustUs chat room:
   chat, room code, QR code, countdown, connection status,
   names, typing indicator, voice call and video call.
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
  let pendingOffer = null;
  let pendingIceCandidates = [];

  let callType = null;
  let isCaller = false;

  const rtcConfig = {
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
  // CACHE ELEMENTS
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

    els.callPanel =
      document.getElementById('callPanel');

    els.callTitle =
      document.getElementById('callTitle');

    els.endCallBtn =
      document.getElementById('endCallBtn');

    els.remoteVideo =
      document.getElementById('remoteVideo');

    els.localVideo =
      document.getElementById('localVideo');

    els.incomingCallBox =
      document.getElementById('incomingCallBox');

    els.incomingCallText =
      document.getElementById('incomingCallText');

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
    pendingIceCandidates = [];

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


    // Message form
    if (els.textForm) {
      els.textForm.addEventListener(
        'submit',
        onSendText
      );
    }


    // Get room
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
    setupCalls();
  }


  // =========================
  // QR CODE
  // =========================

  function renderQrCode() {

    if (!els.qrCode || typeof QRCode === 'undefined') {
      return;
    }

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
          Toast.success('Chat code copied');
        } else {
          Toast.error('Could not copy code');
        }

      });
  }


  // =========================
  // COUNTDOWN
  // =========================

  function startCountdown() {

    clearInterval(countdownInterval);

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

      clearInterval(countdownInterval);

      endWebRTC(false);
      onRoomExpired();

      return;
    }

    els.timerText.textContent =
      Utils.formatCountdown(remaining);

    els.timerText.classList.toggle(
      'warn',
      remaining < 5 * 60 * 1000 &&
      remaining >= 60 * 1000
    );

    els.timerText.classList.toggle(
      'danger',
      remaining < 60 * 1000
    );
  }


  function onRoomExpired() {

    Toast.warn(
      'This chat has expired.'
    );

    endWebRTC(false);

    Router.navigate('/expired');
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


    // Someone joined
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


    // Someone left
    socket.on(
      'room:user-left',
      ({ connectedUsers }) => {

        updateConnectionStatus(
          connectedUsers
        );

        if (els.typingStatus) {
          els.typingStatus.textContent = '';
        }

        endWebRTC(false);
      }
    );


    // New message
    socket.on(
      'message:receive',
      (message) => {
        appendMessage(message);
      }
    );


    // Typing started
    socket.on(
      'typing:start',
      ({ name }) => {

        if (els.typingStatus) {
          els.typingStatus.textContent =
            `${name || 'Your person'} is typing…`;
        }
      }
    );


    // Typing stopped
    socket.on(
      'typing:stop',
      () => {

        if (els.typingStatus) {
          els.typingStatus.textContent = '';
        }
      }
    );


    // =========================
    // VOICE CALL SIGNAL
    // =========================

    socket.on(
      'call:voice',
      async ({ name, signal }) => {

        if (!signal) return;

        if (signal.type === 'offer') {

          await receiveCall(
            'voice',
            name,
            signal
          );

        } else if (signal.type === 'answer') {

          await handleAnswer(signal);
        }
      }
    );


    // =========================
    // VIDEO CALL SIGNAL
    // =========================

    socket.on(
      'call:video',
      async ({ name, signal }) => {

        if (!signal) return;

        if (signal.type === 'offer') {

          await receiveCall(
            'video',
            name,
            signal
          );

        } else if (signal.type === 'answer') {

          await handleAnswer(signal);
        }
      }
    );


    // =========================
    // ICE CANDIDATE
    // =========================

    socket.on(
      'call:ice',
      async ({ candidate }) => {

        if (!candidate) {
          return;
        }

        if (!peerConnection) {
          pendingIceCandidates.push(candidate);
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


    // =========================
    // CALL END
    // =========================

    socket.on(
      'call:end',
      () => {

        endWebRTC(false);

        Toast.info(
          'Call ended.'
        );
      }
    );


    // =========================
    // RECONNECT
    // =========================

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
  // LOAD MESSAGES
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
      knownMessageIds.has(message.id)
    ) {
      return;
    }

    knownMessageIds.add(message.id);

    if (
      els.messageEmptyState &&
      els.messageEmptyState.parentElement
    ) {
      els.messageEmptyState.remove();
    }

    const li =
      document.createElement('li');

    const isMine =
      message.senderId === mySocketId;

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
      li.querySelector('.message-name');

    nameElement.textContent =
      message.senderName ||
      (isMine
        ? myName
        : 'Your person');

    const textElement =
      li.querySelector('.message-text');

    textElement.textContent =
      message.text;

    const copyButton =
      li.querySelector('.copy-text-btn');

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

    els.messageList.appendChild(li);

    els.messageList.scrollTop =
      els.messageList.scrollHeight;
  }


  // =========================
  // TYPING
  // =========================

  function setupTyping() {

    if (!els.textInput) {
      return;
    }

    els.textInput.addEventListener(
      'input',
      () => {

        SocketClient.startTyping(code);

        clearTimeout(typingTimer);

        typingTimer =
          setTimeout(
            () => {
              SocketClient.stopTyping(code);
            },
            1000
          );
      }
    );

    els.textInput.addEventListener(
      'blur',
      () => {

        clearTimeout(typingTimer);

        SocketClient.stopTyping(code);
      }
    );
  }


  // =========================
  // CALL BUTTONS
  // =========================

  function setupCalls() {

    if (els.voiceCallBtn) {

      els.voiceCallBtn.addEventListener(
        'click',
        () => startCall('voice')
      );
    }

    if (els.videoCallBtn) {

      els.videoCallBtn.addEventListener(
        'click',
        () => startCall('video')
      );
    }

    if (els.endCallBtn) {

      els.endCallBtn.addEventListener(
        'click',
        () => {

          SocketClient.endCall(code);

          endWebRTC(false);
        }
      );
    }

    if (els.acceptCallBtn) {

      els.acceptCallBtn.addEventListener(
        'click',
        acceptIncomingCall
      );
    }

    if (els.rejectCallBtn) {

      els.rejectCallBtn.addEventListener(
        'click',
        rejectIncomingCall
      );
    }
  }


  // =========================
  // START CALL
  // =========================

  async function startCall(type) {

    if (peerConnection) {

      Toast.info(
        'A call is already active.'
      );

      return;
    }

    callType = type;
    isCaller = true;

    try {

      await createPeerConnection();

      localStream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'video'
        });

      attachLocalStream();

      showCallPanel(
        type === 'video'
          ? 'Video Call ❤️'
          : 'Voice Call ❤️'
      );

      localStream.getTracks().forEach(
        (track) => {

          peerConnection.addTrack(
            track,
            localStream
          );
        }
      );

      const offer =
        await peerConnection.createOffer();

      await peerConnection.setLocalDescription(
        offer
      );

      const signal = {
        type: 'offer',
        callType: type,
        sdp: offer
      };

      if (type === 'video') {

        SocketClient.sendVideoCallSignal(
          code,
          signal
        );

      } else {

        SocketClient.sendVoiceCallSignal(
          code,
          signal
        );
      }

      Toast.info(
        'Calling your person…'
      );

    } catch (err) {

      console.error(
        'CALL START ERROR:',
        err
      );

      endWebRTC(false);

      Toast.error(
        'Could not start the call. Check microphone/camera permission.'
      );
    }
  }


  // =========================
  // CREATE PEER CONNECTION
  // =========================

  async function createPeerConnection() {

    peerConnection =
      new RTCPeerConnection(
        rtcConfig
      );

    peerConnection.onicecandidate =
      (event) => {

        if (
          event.candidate
        ) {

          SocketClient.sendIceCandidate(
            code,
            event.candidate
          );
        }
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

          els.remoteVideo.play()
            .catch(() => {});
        }
      };

    peerConnection.onconnectionstatechange =
      () => {

        if (!peerConnection) {
          return;
        }

        const state =
          peerConnection.connectionState;

        if (state === 'connected') {

          Toast.success(
            'Call connected ❤️'
          );
        }

        if (
          state === 'failed' ||
          state === 'closed'
        ) {

          endWebRTC(false);
        }
      };

    peerConnection.oniceconnectionstatechange =
      () => {

        if (!peerConnection) {
          return;
        }

        if (
          peerConnection.iceConnectionState ===
          'failed'
        ) {

          Toast.error(
            'Connection could not be established.'
          );
        }
      };

    // Add candidates received before peer was ready
    if (pendingIceCandidates.length) {

      for (
        const candidate
        of pendingIceCandidates
      ) {

        try {

          await peerConnection.addIceCandidate(
            new RTCIceCandidate(candidate)
          );

        } catch (err) {

          console.error(
            'Pending ICE error:',
            err
          );
        }
      }

      pendingIceCandidates = [];
    }
  }


  // =========================
  // RECEIVE CALL
  // =========================

  async function receiveCall(
    type,
    name,
    signal
  ) {

    if (signal.type !== 'offer') {
      return;
    }

    // Do not overwrite an active call
    if (peerConnection) {
      return;
    }

    pendingOffer = {
      type,
      name,
      sdp: signal.sdp
    };

    if (els.incomingCallBox) {
      els.incomingCallBox.hidden = false;
    }

    if (els.incomingCallText) {

      els.incomingCallText.textContent =
        `${name || 'Your person'} is calling ${
          type === 'video'
            ? '📹'
            : '📞'
        }`;
    }

    showCallPanel(
      type === 'video'
        ? 'Incoming Video Call ❤️'
        : 'Incoming Voice Call ❤️'
    );
  }


  // =========================
  // ACCEPT CALL
  // =========================

  async function acceptIncomingCall() {

    if (!pendingOffer) {
      return;
    }

    const offer =
      pendingOffer;

    pendingOffer = null;

    isCaller = false;
    callType = offer.type;

    try {

      if (els.incomingCallBox) {
        els.incomingCallBox.hidden = true;
      }

      await createPeerConnection();

      localStream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: offer.type === 'video'
        });

      attachLocalStream();

      showCallPanel(
        offer.type === 'video'
          ? 'Video Call ❤️'
          : 'Voice Call ❤️'
      );

      localStream.getTracks().forEach(
        (track) => {

          peerConnection.addTrack(
            track,
            localStream
          );
        }
      );

      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(
          offer.sdp
        )
      );

      const answer =
        await peerConnection.createAnswer();

      await peerConnection.setLocalDescription(
        answer
      );

      const signal = {
        type: 'answer',
        callType: offer.type,
        sdp: answer
      };

      if (offer.type === 'video') {

        SocketClient.sendVideoCallSignal(
          code,
          signal
        );

      } else {

        SocketClient.sendVoiceCallSignal(
          code,
          signal
        );
      }

    } catch (err) {

      console.error(
        'ACCEPT CALL ERROR:',
        err
      );

      endWebRTC(false);

      Toast.error(
        'Could not accept the call.'
      );
    }
  }


  // =========================
  // REJECT CALL
  // =========================

  function rejectIncomingCall() {

    pendingOffer = null;

    if (els.incomingCallBox) {
      els.incomingCallBox.hidden = true;
    }

    SocketClient.endCall(code);

    hideCallPanel();

    Toast.info(
      'Call declined.'
    );
  }


  // =========================
  // HANDLE ANSWER
  // =========================

  async function handleAnswer(signal) {

    if (
      !peerConnection ||
      !signal ||
      !signal.sdp
    ) {
      return;
    }

    try {

      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(
          signal.sdp
        )
      );

    } catch (err) {

      console.error(
        'ANSWER ERROR:',
        err
      );
    }
  }


  // =========================
  // ATTACH LOCAL STREAM
  // =========================

  function attachLocalStream() {

    if (
      els.localVideo &&
      localStream
    ) {

      els.localVideo.srcObject =
        localStream;

      els.localVideo.muted = true;

      els.localVideo.play()
        .catch(() => {});
    }
  }


  // =========================
  // SHOW CALL PANEL
  // =========================

  function showCallPanel(title) {

    if (els.callPanel) {
      els.callPanel.hidden = false;
    }

    if (els.callTitle) {
      els.callTitle.textContent = title;
    }
  }


  // =========================
  // HIDE CALL PANEL
  // =========================

  function hideCallPanel() {

    if (els.callPanel) {
      els.callPanel.hidden = true;
    }

    if (els.incomingCallBox) {
      els.incomingCallBox.hidden = true;
    }
  }


  // =========================
  // END WEBRTC
  // =========================

  function endWebRTC(notifyRemote) {

    if (
      notifyRemote &&
      code
    ) {
      SocketClient.endCall(code);
    }

    if (localStream) {

      localStream.getTracks().forEach(
        (track) => track.stop()
      );

      localStream = null;
    }

    if (peerConnection) {

      peerConnection.ontrack = null;
      peerConnection.onicecandidate = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.oniceconnectionstatechange = null;

      peerConnection.close();

      peerConnection = null;
    }

    if (els.localVideo) {
      els.localVideo.srcObject = null;
    }

    if (els.remoteVideo) {
      els.remoteVideo.srcObject = null;
    }

    pendingOffer = null;
    pendingIceCandidates = [];
    callType = null;
    isCaller = false;

    hideCallPanel();
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

    if (code) {

      SocketClient.stopTyping(code);

      SocketClient.endCall(code);

      SocketClient.leaveRoom(code);
    }

    endWebRTC(false);

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
  }


  return {
    init,
    teardown
  };

})();
