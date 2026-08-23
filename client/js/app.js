/* Top-level application logic: wires up each screen's controls. */

const App = (() => {

  // =========================
  // HOME
  // =========================
  function initHome() {
    const form = document.getElementById('quickJoinForm');
    const input = document.getElementById('quickJoinInput');

    if (!form || !input) return;

    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase();
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      attemptJoin(input.value, form.querySelector('button'));
    });
  }


  // =========================
  // CREATE CHAT
  // =========================
  async function initCreate() {
    const form = document.getElementById('startChatForm');
    const nameInput = document.getElementById('chatName');
    const startBtn = document.getElementById('startChatBtn');
    const errorBox = document.getElementById('shareError');

    if (!form || !nameInput || !startBtn) return;

    nameInput.focus();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = nameInput.value.trim();

      if (!name) {
        if (errorBox) {
          errorBox.textContent = 'Please enter your name.';
          errorBox.hidden = false;
        }
        return;
      }

      if (errorBox) {
        errorBox.hidden = true;
      }

      startBtn.disabled = true;
      startBtn.textContent = 'Starting Chat…';

      try {

        const transfer = await Api.createRoom();

        console.log('CREATE CHAT RESPONSE:', transfer);

        const code =
          transfer.code ||
          transfer.roomCode ||
          transfer.data?.code;

        if (!code) {
          throw new Error('Could not generate chat code.');
        }

        // Save creator status
        sessionStorage.setItem(
          `qd-creator-${code}`,
          '1'
        );

        // Save creator name
        sessionStorage.setItem(
          `qd-chat-name-${code}`,
          name
        );

        // Open chat
        Router.navigate(`/room/${code}`);

      } catch (err) {

        console.error('CREATE CHAT ERROR:', err);

        if (errorBox) {
          errorBox.textContent =
            err.message || 'Could not start the chat.';
          errorBox.hidden = false;
        }

        startBtn.disabled = false;
        startBtn.textContent = 'Start Chat ❤️';
      }
    });
  }


  // =========================
  // JOIN CHAT
  // =========================
  function initJoin() {
    const form = document.getElementById('joinForm');
    const input = document.getElementById('joinCodeInput');
    const errorBox = document.getElementById('joinError');
    const submitBtn = document.getElementById('joinSubmitBtn');

    if (!form || !input || !submitBtn) return;

    input.focus();

    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase();

      if (errorBox) {
        errorBox.hidden = true;
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (errorBox) {
        errorBox.hidden = true;
      }

      await attemptJoin(
        input.value,
        submitBtn,
        errorBox
      );
    });
  }


  // =========================
  // JOIN ROOM
  // =========================
  async function attemptJoin(
    rawCode,
    buttonEl,
    errorBox
  ) {
    const code = Utils.normalizeCode(rawCode);

    if (code.length < 4) {

      const msg = 'Enter the full chat code.';

      if (errorBox) {
        errorBox.textContent = msg;
        errorBox.hidden = false;
      } else {
        Toast.error(msg);
      }

      return;
    }

    const originalText = buttonEl.textContent;

    buttonEl.disabled = true;
    buttonEl.textContent = 'Joining…';

    try {

      await Api.getRoom(code);

      Router.navigate(`/room/${code}`);

    } catch (err) {

      const msg =
        err.message ||
        'This chat does not exist or has expired.';

      if (errorBox) {
        errorBox.textContent = msg;
        errorBox.hidden = false;
      } else {
        Toast.error(msg);
      }

    } finally {

      buttonEl.disabled = false;
      buttonEl.textContent = originalText;

    }
  }


  // =========================
  // ROOM
  // =========================
  function initRoom(code) {
    RoomController.init(code);

    return () => RoomController.teardown();
  }


  // =========================
  // EXPORT
  // =========================
  return {
    initHome,
    initCreate,
    initJoin,
    initRoom
  };

})();


// Start application
Router.init();
