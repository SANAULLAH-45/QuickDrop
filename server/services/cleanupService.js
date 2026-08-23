const roomService = require('./roomService');

const SWEEP_INTERVAL_MS = 30 * 1000; // check every 30 seconds

/**
 * Starts a background interval that deletes expired rooms (and their
 * temporary files) and notifies connected clients via Socket.IO so any
 * open tab immediately shows the "Room Expired" state instead of waiting
 * for a failed request.
 */
function startCleanupService(io) {
  const timer = setInterval(() => {
    const deletedCodes = roomService.sweepExpiredRooms();
    for (const code of deletedCodes) {
      io.to(code).emit('room:expired', { code });
      console.log(`[cleanup] Room ${code} expired and was removed.`);
    }
  }, SWEEP_INTERVAL_MS);

  // Don't let this interval keep the process alive on its own.
  timer.unref();
  return timer;
}

module.exports = { startCleanupService };
