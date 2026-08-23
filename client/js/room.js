/* Controls the Active Share Room screen: joining, text messaging, file
   upload/download, QR code, countdown timer, and connection status. */

const RoomController = (() => {
  let code = null;
  let mySocketId = null;
  let expiresAt = null;
  let countdownInterval = null;
  let knownMessageIds = new Set();
  let knownFileIds = new Set();
  let maxFileSizeMB = 50;

  const els = {};

  function cacheEls() {
    els.roomCodeText = document.getElementById('roomCodeText');
    els.copyCodeBtn = document.getElementById('copyCodeBtn');
    els.connectionDot = document.getElementById('connectionDot');
    els.connectionText = document.getElementById('connectionText');
    els.timerText = document.getElementById('timerText');
    els.qrCode = document.getElementById('qrCode');
    els.textForm = document.getElementById('textForm');
    els.textInput = document.getElementById('textInput');
    els.messageList = document.getElementById('messageList');
    els.messageEmptyState = document.getElementById('messageEmptyState');
    els.dropzone = document.getElementById('dropzone');
    els.fileInput = document.getElementById('fileInput');
    els.fileList = document.getElementById('fileList');
    els.fileEmptyState = document.getElementById('fileEmptyState');
    els.maxFileSizeLabel = document.getElementById('maxFileSizeLabel');
  }

  async function init(roomCode) {
    code = Utils.normalizeCode(roomCode);
    cacheEls();
    knownMessageIds = new Set();
    knownFileIds = new Set();

    els.roomCodeText.textContent = code;
    renderQrCode();

    Api.getConfig().then((cfg) => {
      maxFileSizeMB = cfg.maxFileSizeMB;
      els.maxFileSizeLabel.textContent = `${cfg.maxFileSizeMB}MB`;
    }).catch(() => { /* fall back to default silently */ });

    els.copyCodeBtn.addEventListener('click', onCopyCode);
    els.textForm.addEventListener('submit', onSendText);
    els.dropzone.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', onFilesSelected);
    setupDragDrop();

    try {
      const roomState = await Api.getRoom(code);
      expiresAt = roomState.expiresAt;
      hydrateMessages(roomState.messages);
      hydrateFiles(roomState.files);
      startCountdown();
    } catch (err) {
      Router.navigate('/expired');
      return;
    }

    try {
      const joinResponse = await SocketClient.joinRoom(code, sessionStorage.getItem(`qd-creator-${code}`) ? 'creator' : 'joiner');
      mySocketId = joinResponse.socketId;
      updateConnectionStatus(joinResponse.room.connectedUsers);
    } catch (err) {
      Toast.error(err.message);
      Router.navigate('/expired');
      return;
    }

    bindSocketEvents();
  }

  function renderQrCode() {
    els.qrCode.innerHTML = '';
    const joinUrl = `${window.location.origin}/#/room/${code}`;
    // eslint-disable-next-line no-undef
    new QRCode(els.qrCode, {
      text: joinUrl,
      width: 148,
      height: 148,
      colorDark: '#0C0F14',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  function onCopyCode() {
    Utils.copyToClipboard(code).then((ok) => {
      if (ok) Toast.success('Room code copied');
      else Toast.error('Could not copy code');
    });
  }

  /* ---------------- Countdown timer ---------------- */

  function startCountdown() {
    clearInterval(countdownInterval);
    updateCountdownDisplay();
    countdownInterval = setInterval(updateCountdownDisplay, 1000);
  }

  function updateCountdownDisplay() {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      onRoomExpired();
      return;
    }
    els.timerText.textContent = Utils.formatCountdown(remaining);
    els.timerText.classList.toggle('warn', remaining < 5 * 60 * 1000 && remaining >= 60 * 1000);
    els.timerText.classList.toggle('danger', remaining < 60 * 1000);
  }

  function onRoomExpired() {
    Toast.warn('This room has expired.');
    Router.navigate('/expired');
  }

  /* ---------------- Connection status ---------------- */

  function updateConnectionStatus(connectedUsers) {
    const otherPresent = connectedUsers >= 2;
    els.connectionDot.classList.toggle('online', otherPresent);
    els.connectionText.textContent = otherPresent
      ? 'Connected — the other person is here'
      : 'Waiting for the other person…';
  }

  /* ---------------- Socket events ---------------- */

  function bindSocketEvents() {
    const socket = SocketClient.get();

    socket.on('room:user-joined', ({ connectedUsers }) => {
      updateConnectionStatus(connectedUsers);
      Toast.info('Someone joined the room');
    });

    socket.on('room:user-left', ({ connectedUsers }) => {
      updateConnectionStatus(connectedUsers);
    });

    socket.on('message:receive', (message) => {
      appendMessage(message);
    });

    socket.on('file:available', (file) => {
      appendFile(file);
      if (file.senderId !== mySocketId) {
        Toast.info(`New file received: ${file.name}`);
      }
    });

    socket.on('file:deleted', ({ fileId }) => {
      removeFileFromDom(fileId);
    });

    socket.on('room:expired', ({ code: expiredCode }) => {
      if (expiredCode === code) onRoomExpired();
    });

    socket.io.on('reconnect', async () => {
      try {
        const joinResponse = await SocketClient.joinRoom(code, 'joiner');
        mySocketId = joinResponse.socketId;
        updateConnectionStatus(joinResponse.room.connectedUsers);
        Toast.success('Reconnected');
      } catch (err) {
        onRoomExpired();
      }
    });
  }

  /* ---------------- Text messaging ---------------- */

  async function onSendText(e) {
    e.preventDefault();
    const text = els.textInput.value.trim();
    if (!text) return;

    const btn = document.getElementById('sendTextBtn');
    btn.disabled = true;
    try {
      await SocketClient.sendMessage(code, text);
      els.textInput.value = '';
    } catch (err) {
      Toast.error(err.message);
    } finally {
      btn.disabled = false;
      els.textInput.focus();
    }
  }

  function hydrateMessages(messages) {
    els.messageList.innerHTML = '';
    if (!messages || messages.length === 0) {
      els.messageList.appendChild(els.messageEmptyState);
      return;
    }
    messages.forEach(appendMessage);
  }

  function appendMessage(message) {
    if (knownMessageIds.has(message.id)) return;
    knownMessageIds.add(message.id);

    if (els.messageEmptyState.parentElement) els.messageEmptyState.remove();

    const li = document.createElement('li');
    li.className = 'message-item' + (message.senderId === mySocketId ? ' mine' : '');
    li.innerHTML = `
      <div class="message-text"></div>
      <div class="message-meta">
        <span class="message-time">${Utils.formatTime(message.timestamp)}</span>
        <button class="copy-text-btn" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy
        </button>
      </div>
    `;
    li.querySelector('.message-text').textContent = message.text;
    li.querySelector('.copy-text-btn').addEventListener('click', () => {
      Utils.copyToClipboard(message.text).then((ok) => {
        if (ok) Toast.success('Text copied');
      });
    });

    els.messageList.appendChild(li);
    els.messageList.scrollTop = els.messageList.scrollHeight;
  }

  /* ---------------- File sharing ---------------- */

  function setupDragDrop() {
    ['dragenter', 'dragover'].forEach((evt) => {
      els.dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        els.dropzone.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach((evt) => {
      els.dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        els.dropzone.classList.remove('dragover');
      });
    });
    els.dropzone.addEventListener('drop', (e) => {
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length) handleFiles(files);
    });
  }

  function onFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    if (files.length) handleFiles(files);
    e.target.value = '';
  }

  function handleFiles(files) {
    files.forEach(uploadOneFile);
  }

  async function uploadOneFile(file) {
    const maxBytes = maxFileSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      Toast.error(`"${file.name}" exceeds the ${maxFileSizeMB}MB limit.`);
      return;
    }

    if (els.fileEmptyState.parentElement) els.fileEmptyState.remove();

    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const li = buildFileListItem({
      id: tempId,
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream'
    }, { uploading: true });
    els.fileList.appendChild(li);

    try {
      const uploaded = await Api.uploadFile(code, file, mySocketId, (percent) => {
        const fill = li.querySelector('.progress-fill');
        if (fill) fill.style.width = `${percent}%`;
      });
      li.remove(); // the file:available socket event (echoed back to us too) will render the final row
      knownFileIds.delete(tempId);
      // In case the socket event already fired before upload() resolved:
      if (!knownFileIds.has(uploaded.id)) {
        appendFile({ ...uploaded, senderId: mySocketId });
      }
    } catch (err) {
      Toast.error(err.message || `Failed to upload "${file.name}".`);
      li.remove();
      if (els.fileList.children.length === 0) {
        els.fileList.appendChild(els.fileEmptyState);
      }
    }
  }

  function hydrateFiles(files) {
    els.fileList.innerHTML = '';
    if (!files || files.length === 0) {
      els.fileList.appendChild(els.fileEmptyState);
      return;
    }
    files.forEach((f) => appendFile(f));
  }

  function appendFile(file) {
    if (knownFileIds.has(file.id)) return;
    knownFileIds.add(file.id);

    if (els.fileEmptyState.parentElement) els.fileEmptyState.remove();

    const li = buildFileListItem(file, { uploading: false });
    els.fileList.appendChild(li);
  }

  function buildFileListItem(file, { uploading }) {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.dataset.fileId = file.id;

    const icon = Utils.fileIconFor(file.mimeType || '', file.name);
    li.innerHTML = `
      <div class="file-icon">${icon}</div>
      <div class="file-info">
        <div class="file-name"></div>
        <div class="file-meta">${Utils.formatBytes(file.size)}</div>
        ${uploading ? '<div class="progress-track"><div class="progress-fill"></div></div>' : ''}
      </div>
      <div class="file-actions"></div>
    `;
    li.querySelector('.file-name').textContent = file.name;

    const actions = li.querySelector('.file-actions');
    if (!uploading) {
      const downloadBtn = document.createElement('a');
      downloadBtn.className = 'icon-btn';
      downloadBtn.title = 'Download';
      downloadBtn.href = Api.downloadFileUrl(code, file.id);
      downloadBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
      actions.appendChild(downloadBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'icon-btn';
      deleteBtn.title = 'Remove';
      deleteBtn.type = 'button';
      deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>';
      deleteBtn.addEventListener('click', () => onDeleteFile(file.id));
      actions.appendChild(deleteBtn);
    }

    return li;
  }

  async function onDeleteFile(fileId) {
    try {
      await Api.deleteFile(code, fileId);
    } catch (err) {
      Toast.error(err.message || 'Could not remove file.');
    }
  }

  function removeFileFromDom(fileId) {
    knownFileIds.delete(fileId);
    const li = els.fileList.querySelector(`[data-file-id="${fileId}"]`);
    if (li) li.remove();
    if (els.fileList.children.length === 0) {
      els.fileList.appendChild(els.fileEmptyState);
    }
  }

  function teardown() {
    clearInterval(countdownInterval);
    if (code) SocketClient.leaveRoom(code);
    const socket = SocketClient.get();
    ['room:user-joined', 'room:user-left', 'message:receive', 'file:available', 'file:deleted', 'room:expired'].forEach((evt) => {
      socket.off(evt);
    });
    code = null;
  }

  return { init, teardown };
})();
