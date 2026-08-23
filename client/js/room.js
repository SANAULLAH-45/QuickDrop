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
  let remoteStream = null;

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
      },
      {
        urls: 'stun:stun2.l.google.com:19302'
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

    els.remoteAudio =
      document.getElementById('remoteAudio');

    els.incomingCallBox =
      document.getElementById('incomingCallBox');

    els.incomingCallText =
      document.getElementById('incomingCallText');

    els.acceptCallBtn =
      document.getElementById('acceptCallBtn');

    els.rejectCallBtn =
      document.getElementById('rejectCallBtn');

    els.enableAudioBtn =
      document.getElementById('enableAudioBtn');


    // =========================
    // AUDIO FALLBACK
    // =========================

    if (!els.remoteAudio) {

      els.remoteAudio =
        document.createElement('audio');

      els.remoteAudio.id =
        'remoteAudio';

      els.remoteAudio.autoplay =
        true;

      els.remoteAudio.playsInline =
        true;

      els.remoteAudio.controls =
        false;

      els.remoteAudio.style.display =
        'none';

      document.body.appendChild(
        els.remoteAudio
      );
    }


    // =========================
    // VIDEO SETTINGS
    // =========================

    if (els.remoteVideo) {

      els.remoteVideo.autoplay =
        true;

      els.remoteVideo.playsInline =
        true;

      els.remoteVideo.controls =
        false;
    }


    if (els.localVideo) {

      els.localVideo.autoplay =
        true;

      els.localVideo.playsInline =
        true;

      els.localVideo.muted =
        true;

      els.localVideo.controls =
        false;
    }
  }


  // =========================
  // INITIALIZE ROOM
  // =========================

  async function init(roomCode) {

    code =
      Utils.normalizeCode(roomCode);

    myName =
      sessionStorage.getItem(
        `qd-chat-name-${code}`
      ) || 'You';

    cacheEls();

    knownMessageIds =
      new Set();

    pendingIceCandidates =
      [];

    remoteStream =
      null;


    if (els.roomCodeText) {

      els.roomCodeText.textContent =
        code;
    }


    renderQrCode();


    // =========================
    // COPY CODE
    // =========================

    if (els.copyCodeBtn) {

      els.copyCodeBtn.addEventListener(
        'click',
        onCopyCode
      );
    }


    // =========================
    // MESSAGE FORM
    // =========================

    if (els.textForm) {

      els.textForm.addEventListener(
        'submit',
        onSendText
      );
    }


    // =========================
    // AUDIO UNLOCK
    // =========================

    if (els.enableAudioBtn) {

      els.enableAudioBtn.addEventListener(
        'click',
        enableRemoteAudio
      );

      els.enableAudioBtn.hidden =
        true;
    }


    // =========================
    // GET ROOM
    // =========================

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


    // =========================
    // JOIN SOCKET ROOM
    // =========================

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

    if (!els.qrCode) {
      return;
    }


    els.qrCode.innerHTML =
      '';


    const joinUrl =
      `${window.location.origin}/#/room/${code}`;


    new QRCode(
      els.qrCode,
      {
        text: joinUrl,
        width: 148,
        height: 148,
        colorDark: '#0C0F14',
        colorLight: '#ffffff',
        correctLevel:
          QRCode.CorrectLevel.M
      }
    );
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

    if (
      !expiresAt ||
      !els.timerText
    ) {
      return;
    }


    const remaining =
      new Date(expiresAt).getTime()
      - Date.now();


    if (remaining <= 0) {

      clearInterval(
        countdownInterval
      );

      endWebRTC(false);

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


    endWebRTC(false);


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


    // =========================
    // USER JOINED
    // =========================

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


    // =========================
    // USER LEFT
    // =========================

    socket.on(
      'room:user-left',
      ({ connectedUsers }) => {

        updateConnectionStatus(
          connectedUsers
        );


        if (els.typingStatus) {

          els.typingStatus.textContent =
            '';
        }


        endWebRTC(false);
      }
    );


    // =========================
    // MESSAGE
    // =========================

    socket.on(
      'message:receive',
      (message) => {

        appendMessage(
          message
        );
      }
    );


    // =========================
    // TYPING START
    // =========================

    socket.on(
      'typing:start',
      ({ name }) => {

        if (els.typingStatus) {

          els.typingStatus.textContent =
            `${name || 'Your person'} is typing…`;
        }
      }
    );


    // =========================
    // TYPING STOP
    // =========================

    socket.on(
      'typing:stop',
      () => {

        if (els.typingStatus) {

          els.typingStatus.textContent =
            '';
        }
      }
    );


    // =========================
    // VOICE SIGNAL
    // =========================

    socket.on(
      'call:voice',
      async ({ name, signal }) => {

        if (!signal) {
          return;
        }


        await handleCallSignal(
          'voice',
          name,
          signal
        );
      }
    );


    // =========================
    // VIDEO SIGNAL
    // =========================

    socket.on(
      'call:video',
      async ({ name, signal }) => {

        if (!signal) {
          return;
        }


        await handleCallSignal(
          'video',
          name,
          signal
        );
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


        // ICE can arrive before
        // remote description.

        if (
          !peerConnection ||
          !peerConnection.remoteDescription
        ) {

          pendingIceCandidates.push(
            candidate
          );

          return;
        }


        try {

          await peerConnection.addIceCandidate(
            new RTCIceCandidate(
              candidate
            )
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
  // HANDLE CALL SIGNAL
  // =========================

  async function handleCallSignal(
    type,
    name,
    signal
  ) {

    if (
      signal.type === 'answer'
    ) {

      await handleAnswer(
        signal
      );

      return;
    }


    if (
      signal.type === 'offer'
    ) {

      await receiveCall(
        type,
        name,
        signal
      );
    }
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

      SocketClient.stopTyping(
        code
      );


      await SocketClient.sendMessage(
        code,
        text
      );


      els.textInput.value =
        '';

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

  function hydrateMessages(
    messages
  ) {

    if (!els.messageList) {
      return;
    }


    els.messageList.innerHTML =
      '';


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
      (
        isMine
          ? ' mine'
          : ''
      );


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
      (
        isMine
          ? myName
          : 'Your person'
      );


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
  // TYPING
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

          SocketClient.endCall(
            code
          );


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


    callType =
      type;

    isCaller =
      true;


    try {

      // Get media from the user FIRST.
      // This is important for mobile browsers.

      localStream =
        await navigator.mediaDevices.getUserMedia({

          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },

          video:
            type === 'video'
        });


      await createPeerConnection();


      attachLocalStream();


      showCallPanel(
        type === 'video'
          ? 'Video Call ❤️'
          : 'Voice Call ❤️'
      );


      localStream
        .getTracks()
        .forEach(
          (track) => {

            peerConnection.addTrack(
              track,
              localStream
            );
          }
        );


      const offer =
        await peerConnection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo:
            type === 'video'
        });


      await peerConnection.setLocalDescription(
        offer
      );


      const signal = {

        type: 'offer',

        callType:
          type,

        sdp:
          peerConnection.localDescription
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


    remoteStream =
      new MediaStream();


    // =========================
    // ICE
    // =========================

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


    // =========================
    // REMOTE TRACK
    // =========================

    peerConnection.ontrack =
      async (event) => {

        console.log(
          'REMOTE TRACK:',
          event.track.kind
        );


        // Always add every remote track
        // to ONE remote MediaStream.

        if (
          !remoteStream
        ) {

          remoteStream =
            new MediaStream();
        }


        const alreadyExists =
          remoteStream
            .getTracks()
            .some(
              (track) =>
                track.id ===
                event.track.id
            );


        if (!alreadyExists) {

          remoteStream.addTrack(
            event.track
          );
        }


        // =========================
        // REMOTE VIDEO
        // =========================

        if (els.remoteVideo) {

          els.remoteVideo.srcObject =
            remoteStream;

          els.remoteVideo.autoplay =
            true;

          els.remoteVideo.playsInline =
            true;

          els.remoteVideo.muted =
            false;

          els.remoteVideo.volume =
            1;


          try {

            await els.remoteVideo.play();

          } catch (err) {

            console.log(
              'Video play blocked:',
              err
            );
          }
        }


        // =========================
        // REMOTE AUDIO
        // =========================

        if (els.remoteAudio) {

          els.remoteAudio.srcObject =
            remoteStream;

          els.remoteAudio.autoplay =
            true;

          els.remoteAudio.playsInline =
            true;

          els.remoteAudio.muted =
            false;

          els.remoteAudio.volume =
            1;


          try {

            await els.remoteAudio.play();

            if (
              els.enableAudioBtn
            ) {

              els.enableAudioBtn.hidden =
                true;
            }

          } catch (err) {

            console.log(
              'Audio autoplay blocked:',
              err
            );


            if (
              els.enableAudioBtn
            ) {

              els.enableAudioBtn.hidden =
                false;
            }
          }
        }


        // If mobile browser blocks
        // autoplay, give user a button.

        if (
          els.enableAudioBtn
        ) {

          els.enableAudioBtn.hidden =
            false;
        }
      };


    // =========================
    // CONNECTION STATE
    // =========================

    peerConnection.onconnectionstatechange =
      () => {

        if (!peerConnection) {
          return;
        }


        const state =
          peerConnection.connectionState;


        console.log(
          'WebRTC connection state:',
          state
        );


        if (
          state === 'connected'
        ) {

          Toast.success(
            'Call connected ❤️'
          );


          // Try audio again once
          // connection is fully established.

          enableRemoteAudio();
        }


        if (
          state === 'failed' ||
          state === 'closed'
        ) {

          endWebRTC(false);
        }
      };


    // =========================
    // ICE STATE
    // =========================

    peerConnection.oniceconnectionstatechange =
      () => {

        if (!peerConnection) {
          return;
        }


        console.log(
          'ICE state:',
          peerConnection.iceConnectionState
        );


        if (
          peerConnection.iceConnectionState ===
          'failed'
        ) {

          console.warn(
            'ICE failed. TURN server may be required on some networks.'
          );
        }
      };
  }


  // =========================
  // RECEIVE CALL
  // =========================

  async function receiveCall(
    type,
    name,
    signal
  ) {

    if (
      signal.type !== 'offer'
    ) {
      return;
    }


    if (peerConnection) {

      SocketClient.endCall(
        code
      );


      endWebRTC(false);
    }


    pendingOffer = {

      type:
        signal.callType ||
        type,

      name:
        name ||
        'Your person',

      sdp:
        signal.sdp
    };


    if (els.incomingCallBox) {

      els.incomingCallBox.hidden =
        false;
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


    pendingOffer =
      null;


    isCaller =
      false;


    callType =
      offer.type;


    try {

      if (els.incomingCallBox) {

        els.incomingCallBox.hidden =
          true;
      }


      // IMPORTANT:
      // getUserMedia is triggered by
      // the Accept button click.

      localStream =
        await navigator.mediaDevices.getUserMedia({

          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },

          video:
            offer.type === 'video'
        });


      await createPeerConnection();


      attachLocalStream();


      showCallPanel(
        offer.type === 'video'
          ? 'Video Call ❤️'
          : 'Voice Call ❤️'
      );


      localStream
        .getTracks()
        .forEach(
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


      // Add ICE candidates which arrived
      // before remote description.

      await flushPendingIceCandidates();


      const answer =
        await peerConnection.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo:
            offer.type === 'video'
        });


      await peerConnection.setLocalDescription(
        answer
      );


      const signal = {

        type: 'answer',

        callType:
          offer.type,

        sdp:
          peerConnection.localDescription
      };


      if (
        offer.type === 'video'
      ) {

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


      // Accept button is a user gesture,
      // so try to unlock audio here.

      await enableRemoteAudio();

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

    pendingOffer =
      null;


    if (els.incomingCallBox) {

      els.incomingCallBox.hidden =
        true;
    }


    SocketClient.endCall(
      code
    );


    hideCallPanel();


    Toast.info(
      'Call declined.'
    );
  }


  // =========================
  // HANDLE ANSWER
  // =========================

  async function handleAnswer(
    signal
  ) {

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


      await flushPendingIceCandidates();


      await enableRemoteAudio();

    } catch (err) {

      console.error(
        'ANSWER ERROR:',
        err
      );


      Toast.error(
        'Could not establish the call.'
      );
    }
  }


  // =========================
  // FLUSH ICE
  // =========================

  async function flushPendingIceCandidates() {

    if (
      !peerConnection ||
      !peerConnection.remoteDescription
    ) {
      return;
    }


    const candidates =
      pendingIceCandidates;


    pendingIceCandidates =
      [];


    for (
      const candidate of candidates
    ) {

      try {

        await peerConnection.addIceCandidate(
          new RTCIceCandidate(
            candidate
          )
        );

      } catch (err) {

        console.error(
          'Queued ICE error:',
          err
        );
      }
    }
  }


  // =========================
  // ENABLE REMOTE AUDIO
  // =========================

  async function enableRemoteAudio() {

    let success =
      false;


    // =========================
    // AUDIO ELEMENT
    // =========================

    if (els.remoteAudio) {

      try {

        els.remoteAudio.muted =
          false;

        els.remoteAudio.volume =
          1;

        els.remoteAudio.autoplay =
          true;

        els.remoteAudio.playsInline =
          true;


        if (
          els.remoteAudio.srcObject
        ) {

          await els.remoteAudio.play();

          success =
            true;
        }

      } catch (err) {

        console.log(
          'Remote audio failed:',
          err
        );
      }
    }


    // =========================
    // VIDEO AUDIO
    // =========================

    if (
      els.remoteVideo &&
      els.remoteVideo.srcObject
    ) {

      try {

        els.remoteVideo.muted =
          false;

        els.remoteVideo.volume =
          1;

        els.remoteVideo.playsInline =
          true;


        await els.remoteVideo.play();

        success =
          true;

      } catch (err) {

        console.log(
          'Remote video audio failed:',
          err
        );
      }
    }


    if (
      els.enableAudioBtn
    ) {

      els.enableAudioBtn.hidden =
        success;
    }


    if (success) {

      Toast.success(
        'Sound enabled 🔊'
      );
    }
  }


  // =========================
  // ATTACH LOCAL STREAM
  // =========================

  function attachLocalStream() {

    if (
      !els.localVideo ||
      !localStream
    ) {
      return;
    }


    els.localVideo.srcObject =
      localStream;


    els.localVideo.autoplay =
      true;


    els.localVideo.playsInline =
      true;


    els.localVideo.muted =
      true;


    els.localVideo.play()
      .catch(() => {});
  }


  // =========================
  // SHOW CALL PANEL
  // =========================

  function showCallPanel(
    title
  ) {

    if (els.callPanel) {

      els.callPanel.hidden =
        false;
    }


    if (els.callTitle) {

      els.callTitle.textContent =
        title;
    }
  }


  // =========================
  // HIDE CALL PANEL
  // =========================

  function hideCallPanel() {

    if (els.callPanel) {

      els.callPanel.hidden =
        true;
    }


    if (els.incomingCallBox) {

      els.incomingCallBox.hidden =
        true;
    }


    if (els.enableAudioBtn) {

      els.enableAudioBtn.hidden =
        true;
    }
  }


  // =========================
  // END WEBRTC
  // =========================

  function endWebRTC(
    notifyRemote
  ) {

    if (
      notifyRemote &&
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
          (track) => {
            track.stop();
          }
        );

      localStream =
        null;
    }


    if (peerConnection) {

      peerConnection.ontrack =
        null;

      peerConnection.onicecandidate =
        null;

      peerConnection.onconnectionstatechange =
        null;

      peerConnection.oniceconnectionstatechange =
        null;

      peerConnection.close();

      peerConnection =
        null;
    }


    if (els.localVideo) {

      els.localVideo.srcObject =
        null;
    }


    if (els.remoteVideo) {

      els.remoteVideo.srcObject =
        null;
    }


    if (els.remoteAudio) {

      try {
        els.remoteAudio.pause();
      } catch (_) {}

      els.remoteAudio.srcObject =
        null;
    }


    remoteStream =
      null;


    pendingOffer =
      null;


    pendingIceCandidates =
      [];


    callType =
      null;


    isCaller =
      false;


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

      SocketClient.stopTyping(
        code
      );


      SocketClient.endCall(
        code
      );


      SocketClient.leaveRoom(
        code
      );
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


    code =
      null;


    mySocketId =
      null;


    myName =
      'You';


    expiresAt =
      null;
  }


  return {
    init,
    teardown
  };

})();
