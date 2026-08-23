const crypto = require('crypto');

// Excludes visually ambiguous characters (0/O, 1/I/L) to reduce user error
// when typing a code shared verbally or read off a screen.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/**
 * Generates a cryptographically secure random room code.
 * @returns {string} A 6-character uppercase alphanumeric code.
 */
function generateRoomCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

/**
 * Generates a room code guaranteed not to collide with an existing key
 * in the provided Map (e.g. the in-memory room store).
 * @param {Map} existingRoomsMap
 * @returns {string}
 */
function generateUniqueRoomCode(existingRoomsMap) {
  let code;
  let attempts = 0;
  do {
    code = generateRoomCode();
    attempts++;
  } while (existingRoomsMap.has(code) && attempts < 20);
  return code;
}

/**
 * Generates a cryptographically secure random ID, used for file IDs and
 * per-socket participant tokens.
 */
function generateId(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { generateRoomCode, generateUniqueRoomCode, generateId };
