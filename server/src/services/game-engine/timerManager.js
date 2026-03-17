const logger = require('../../utils/logger');

const activeTimers = new Map();

/**
 * Start a countdown timer for a session
 * @param {string} sessionPin
 * @param {number} duration - Seconds
 * @param {Function} onTick - Called every second with remaining seconds
 * @param {Function} onExpire - Called when timer reaches 0
 */
const startTimer = (sessionPin, duration, onTick, onExpire) => {
  stopTimer(sessionPin);

  const state = {
    remaining: duration,
    running: true,
    interval: null,
  };

  state.interval = setInterval(() => {
    if (!state.running) return;

    state.remaining -= 1;
    onTick(state.remaining);

    if (state.remaining <= 0) {
      stopTimer(sessionPin);
      onExpire();
    }
  }, 1000);

  activeTimers.set(sessionPin, state);
  logger.debug('Timer started', { sessionPin, duration });
};

/**
 * Pause the timer for a session
 * @param {string} sessionPin
 * @returns {number} Remaining seconds
 */
const pauseTimer = (sessionPin) => {
  const state = activeTimers.get(sessionPin);
  if (!state) return 0;

  state.running = false;
  logger.debug('Timer paused', { sessionPin, remaining: state.remaining });
  return state.remaining;
};

/**
 * Resume a paused timer
 * @param {string} sessionPin
 * @param {Function} onTick
 * @param {Function} onExpire
 */
const resumeTimer = (sessionPin, onTick, onExpire) => {
  const state = activeTimers.get(sessionPin);
  if (!state || state.running) return;

  state.running = true;

  if (state.interval) clearInterval(state.interval);

  state.interval = setInterval(() => {
    if (!state.running) return;

    state.remaining -= 1;
    onTick(state.remaining);

    if (state.remaining <= 0) {
      stopTimer(sessionPin);
      onExpire();
    }
  }, 1000);

  logger.debug('Timer resumed', { sessionPin, remaining: state.remaining });
};

/**
 * Stop and clear the timer for a session
 * @param {string} sessionPin
 */
const stopTimer = (sessionPin) => {
  const state = activeTimers.get(sessionPin);
  if (state) {
    if (state.interval) clearInterval(state.interval);
    activeTimers.delete(sessionPin);
    logger.debug('Timer stopped', { sessionPin });
  }
};

/**
 * Get remaining time for a session
 * @param {string} sessionPin
 * @returns {{ remaining: number, running: boolean }}
 */
const getTimerState = (sessionPin) => {
  const state = activeTimers.get(sessionPin);
  if (!state) return { remaining: 0, running: false };
  return { remaining: state.remaining, running: state.running };
};

/**
 * Force-expire the timer (used for auto-reveal)
 * @param {string} sessionPin
 */
const forceExpire = (sessionPin) => {
  stopTimer(sessionPin);
};

module.exports = {
  startTimer,
  pauseTimer,
  resumeTimer,
  stopTimer,
  getTimerState,
  forceExpire,
};
