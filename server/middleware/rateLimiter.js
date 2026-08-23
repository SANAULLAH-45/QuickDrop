const rateLimit = require('express-rate-limit');

// Room creation is limited more strictly than general API traffic to
// discourage automated mass-creation of rooms (spam / resource exhaustion).
const createRoomLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many rooms created from this network. Please try again later.' }
});

// Joining/looking up rooms is rate-limited more loosely since it's a
// read-mostly, low-cost operation, but still capped to slow brute-force
// guessing of room codes.
const joinRoomLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' }
});

const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads from this network. Please try again shortly.' }
});

module.exports = { createRoomLimiter, joinRoomLimiter, uploadLimiter };
