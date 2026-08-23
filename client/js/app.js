/* Top-level application logic: wires up each screen's controls. */

const App = (() => {
  function initHome() {
    const form = document.getElementById('quickJoinForm');
    const input = document.getElementById('quickJoinInput');

    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase();
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      attemptJoin(input.value, form.querySelector('button'));
    });
  }

  async function initCreate() {
  const textBtn = document.getElementById('textShareBtn');
  const fileBtn = document.getElementById('fileShareBtn');

  const textPanel = document.getElementById('textSharePanel');
  const filePanel = document.getElementById('fileSharePanel');

  const textInput = document.getElementById('shareTextInput');
  const fileInput = document.getElementById('shareFileInput');

  const sendTextBtn = document.getElementById('sendTextBtn');
  const sendFileBtn = document.getElementById('sendFileBtn');

  const selectedFileName = document.getElementById('selectedFileName');
  const errorBox = document.getElementById('shareError');

  if (!textBtn) return;

  // Text mode
  textBtn.addEventListener('click', () => {
    textPanel.hidden = false;
    filePanel.hidden = true;

    textBtn.classList.add('btn-primary');
    fileBtn.classList.remove('btn-primary');

    textInput.focus();
  });

  // File mode
  fileBtn.addEventListener('click', () => {
    textPanel.hidden = true;
    filePanel.hidden = false;

    fileBtn.classList.add('btn-primary');
    textBtn.classList.remove('btn-primary');
  });

  // File selected
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];

    if (!file) {
      selectedFileName.textContent = '';
      sendFileBtn.disabled = true;
      return;
    }

    selectedFileName.textContent =
      `${file.name} (${formatFileSize(file.size)})`;

    sendFileBtn.disabled = false;
  });

  // Send text
  sendTextBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();

    if (!text) {
      showError('Please enter something to share.');
      return;
    }

    await createShare('text', text);
  });

  // Send file
  sendFileBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];

    if (!file) {
      showError('Please choose a file first.');
      return;
    }

    await createShare('file', file);
  });

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function createShare(type, data) {
    errorBox.hidden = true;

    sendTextBtn.disabled = true;
    sendFileBtn.disabled = true;

    try {
      // IMPORTANT:
      // Share/transfer is created ONLY after Send Now.
      const transfer = await Api.createRoom();

      const code = transfer.code;

      sessionStorage.setItem(`qd-creator-${code}`, '1');

      if (type === 'text') {
        sessionStorage.setItem(
          `qd-pending-text-${code}`,
          data
        );
      }

     if (type === 'file') {
  // Store the selected file temporarily in memory.
  window.quickDropPendingFile = data;
}

Router.navigate(`/room/${code}`);

    } catch (err) {
      showError(
        err.message || 'Could not start the share.'
      );

      sendTextBtn.disabled = false;
      sendFileBtn.disabled = false;
    }
  }
}

  function initJoin() {
    const form = document.getElementById('joinForm');
    const input = document.getElementById('joinCodeInput');
    const errorBox = document.getElementById('joinError');
    const submitBtn = document.getElementById('joinSubmitBtn');

    input.focus();
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase();
      errorBox.hidden = true;
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.hidden = true;
      await attemptJoin(input.value, submitBtn, errorBox);
    });
  }

  async function attemptJoin(rawCode, buttonEl, errorBox) {
    const code = Utils.normalizeCode(rawCode);
    if (code.length < 4) {
      const msg = 'Enter the full room code.';
      if (errorBox) { errorBox.textContent = msg; errorBox.hidden = false; }
      else Toast.error(msg);
      return;
    }

    const originalText = buttonEl.textContent;
    buttonEl.disabled = true;
    buttonEl.textContent = 'Checking…';

    try {
      await Api.getRoom(code);
      Router.navigate(`/room/${code}`);
    } catch (err) {
      const msg = err.message || 'This room does not exist or has expired.';
      if (errorBox) { errorBox.textContent = msg; errorBox.hidden = false; }
      else Toast.error(msg);
    } finally {
      buttonEl.disabled = false;
      buttonEl.textContent = originalText;
    }
  }

  function initRoom(code) {
    RoomController.init(code);
    return () => RoomController.teardown();
  }

  return { initHome, initCreate, initJoin, initRoom };
})();

Router.init();
