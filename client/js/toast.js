/* Lightweight toast notification system. */

const Toast = (() => {
  const container = document.getElementById('toastContainer');

  function show(message, type = 'info', duration = 3500) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);

    const timer = setTimeout(() => remove(el), duration);
    el.addEventListener('click', () => {
      clearTimeout(timer);
      remove(el);
    });
  }

  function remove(el) {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 200);
  }

  return {
    info: (msg, d) => show(msg, 'info', d),
    success: (msg, d) => show(msg, 'success', d),
    warn: (msg, d) => show(msg, 'warn', d),
    error: (msg, d) => show(msg, 'error', d)
  };
})();
