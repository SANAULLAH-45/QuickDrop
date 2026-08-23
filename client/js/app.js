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
    try {
      const room = await Api.createRoom();
      sessionStorage.setItem(`qd-creator-${room.code}`, '1');
      Router.navigate(`/room/${room.code}`);
    } catch (err) {
      Toast.error(err.message || 'Could not create a room right now.');
      Router.navigate('/');
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
