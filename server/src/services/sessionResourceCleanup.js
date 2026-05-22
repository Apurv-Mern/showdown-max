const timerManager = require('./game-engine/timerManager');
const logger = require('../utils/logger');

/**
 * Release in-memory resources tied to a session PIN (timers, knockout state, debouncers).
 * Safe to call even when Redis still holds session data.
 * @param {string | number} pin
 */
const cleanupSessionResources = (pin) => {
  const pinKey = String(pin ?? '').trim();
  if (!pinKey) return;

  timerManager.stopTimer(pinKey);

  try {
    const gameController = require('./game-engine/gameController');
    if (typeof gameController.cleanupInMemorySession === 'function') {
      gameController.cleanupInMemorySession(pinKey);
    }
  } catch (err) {
    logger.warn('Session resource cleanup partial failure', { pin: pinKey, error: err.message });
  }
};

module.exports = { cleanupSessionResources };
