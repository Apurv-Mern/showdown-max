const { io } = require('socket.io-client');
const { SOCKET_EVENTS } = require('../../shared/constants/socketEvents');
const { sleep, waitForConnect } = require('./playerBot');

/**
 * Automated host driver: starts the game and advances questions.
 * @param {object} options
 * @param {string} options.url
 * @param {string} options.pin
 * @param {number} options.expectedTeams
 * @param {object} options.stats
 */
const createHostBot = ({ url, pin, expectedTeams, stats }) => {
  const host = {
    socket: null,
    pin,
    expectedTeams,
    teamsJoined: 0,
    gameStarted: false,
    revealPending: false,
    advanceTimer: null,
  };

  const clearAdvanceTimer = () => {
    if (host.advanceTimer) {
      clearTimeout(host.advanceTimer);
      host.advanceTimer = null;
    }
  };

  const scheduleReveal = (delayMs = 1500) => {
    if (host.revealPending) return;
    host.revealPending = true;
    clearAdvanceTimer();
    host.advanceTimer = setTimeout(() => {
      host.revealPending = false;
      host.socket?.emit(SOCKET_EVENTS.REVEAL_ANSWER, { pin });
      stats.hostReveals += 1;
    }, delayMs);
  };

  const scheduleNextQuestion = (delayMs = 2500) => {
    clearAdvanceTimer();
    host.advanceTimer = setTimeout(() => {
      host.revealPending = false;
      host.socket?.emit(SOCKET_EVENTS.NEXT_QUESTION, { pin });
      stats.hostNextQuestions += 1;
    }, delayMs);
  };

  const maybeStartGame = () => {
    if (host.gameStarted) return;
    if (host.teamsJoined < Math.min(host.expectedTeams, 1)) return;
    host.gameStarted = true;
    host.socket.emit(SOCKET_EVENTS.START_GAME, { pin });
    stats.hostStarts += 1;
  };

  const attachHandlers = () => {
    host.socket.on(SOCKET_EVENTS.TEAM_JOINED, () => {
      host.teamsJoined += 1;
      stats.teamsJoined = host.teamsJoined;
      if (host.teamsJoined >= host.expectedTeams) {
        setTimeout(() => maybeStartGame(), 500);
      }
    });

    host.socket.on(SOCKET_EVENTS.ROUND_INTRO, () => {
      setTimeout(() => {
        host.socket?.emit(SOCKET_EVENTS.NEXT_QUESTION, { pin });
        stats.hostNextQuestions += 1;
      }, 800);
    });

    host.socket.on(SOCKET_EVENTS.WAGER_COLLECTION_START, () => {
      setTimeout(() => {
        host.socket?.emit(SOCKET_EVENTS.NEXT_QUESTION, { pin });
        stats.hostNextQuestions += 1;
      }, 3000);
    });

    host.socket.on(SOCKET_EVENTS.QUESTION_ACTIVE, (data) => {
      host.revealPending = false;
      const roundType = String(data?.roundType || '').toUpperCase();
      if (roundType === 'MUSIC') {
        setTimeout(() => {
          host.socket?.emit(SOCKET_EVENTS.START_TIMER, { pin });
          stats.hostTimerStarts += 1;
        }, 400);
      }
    });

    host.socket.on(SOCKET_EVENTS.RESPONSE_COUNT, (data) => {
      const count = Number(data?.count) || 0;
      const total = Number(data?.total) || 0;
      if (total > 0 && count >= total) {
        scheduleReveal(800);
      }
    });

    host.socket.on(SOCKET_EVENTS.AUTO_REVEAL, () => {
      scheduleReveal(500);
    });

    host.socket.on(SOCKET_EVENTS.TIMER_EXPIRED, () => {
      scheduleReveal(1200);
    });

    host.socket.on(SOCKET_EVENTS.ANSWER_REVEAL, () => {
      scheduleNextQuestion(2800);
    });

    host.socket.on(SOCKET_EVENTS.ROUND_END, () => {
      clearAdvanceTimer();
      host.advanceTimer = setTimeout(() => {
        host.socket?.emit(SOCKET_EVENTS.ADVANCE_ROUND, { pin });
        stats.hostAdvanceRounds += 1;
      }, 4000);
    });

    host.socket.on(SOCKET_EVENTS.GAME_END, () => {
      stats.gameEnded = true;
      clearAdvanceTimer();
    });
  };

  host.connect = async () => {
    host.socket = io(url, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 20000,
    });
    attachHandlers();
    await waitForConnect(host.socket);
    host.socket.emit('host_connect', { pin });
    await sleep(500);

    // If bots joined before host connected, start once we see enough teams in session_state
    host.socket.on(SOCKET_EVENTS.SESSION_STATE, (data) => {
      const total = Number(data?.totalTeams) || 0;
      if (total > host.teamsJoined) {
        host.teamsJoined = total;
        stats.teamsJoined = total;
      }
      if (!host.gameStarted && host.teamsJoined >= host.expectedTeams) {
        setTimeout(() => maybeStartGame(), 500);
      }
    });

    // Fallback: start after timeout even if team_joined events were missed
    setTimeout(() => {
      if (!host.gameStarted && host.teamsJoined > 0) {
        maybeStartGame();
      }
    }, 15000);
  };

  host.disconnect = () => {
    clearAdvanceTimer();
    if (host.socket) {
      host.socket.removeAllListeners();
      host.socket.disconnect();
      host.socket = null;
    }
  };

  return host;
};

module.exports = { createHostBot };
