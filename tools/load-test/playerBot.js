const { io } = require('socket.io-client');
const { SOCKET_EVENTS } = require('../../shared/constants/socketEvents');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForConnect = (socket, timeoutMs = 20000) =>
  new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      socket.off('connect', onConnect);
      reject(new Error('Socket connect timeout'));
    }, timeoutMs);
    const onConnect = () => {
      clearTimeout(timer);
      resolve();
    };
    socket.on('connect', onConnect);
  });

const waitForJoin = (socket, timeoutMs = 30000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Join timeout'));
    }, timeoutMs);

    const onSessionState = (data) => {
      if (data?.joined && data?.teamId) {
        cleanup();
        resolve(data);
      }
    };

    const onJoinError = (err) => {
      cleanup();
      reject(new Error(err?.message || 'Join failed'));
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off(SOCKET_EVENTS.SESSION_STATE, onSessionState);
      socket.off(SOCKET_EVENTS.JOIN_ERROR, onJoinError);
    };

    socket.on(SOCKET_EVENTS.SESSION_STATE, onSessionState);
    socket.on(SOCKET_EVENTS.JOIN_ERROR, onJoinError);
  });

/**
 * @param {object} options
 * @param {string} options.url
 * @param {string} options.pin
 * @param {string} options.teamName
 * @param {number} options.index
 * @param {object} options.stats
 */
const createPlayerBot = ({ url, pin, teamName, index, stats }) => {
  const bot = {
    index,
    teamName,
    teamId: null,
    socket: null,
    joined: false,
    answersSubmitted: 0,
    wagersSubmitted: 0,
    errors: [],
    hasAnsweredCurrentQuestion: false,
    hasSubmittedWager: false,
    eliminated: false,
  };

  const pickOptionIndex = (optionCount) => {
    const n = Math.max(1, Number(optionCount) || 4);
    return Math.floor(Math.random() * n);
  };

  const maybeSubmitWager = () => {
    if (bot.hasSubmittedWager || bot.eliminated || !bot.socket?.connected) return;
    bot.hasSubmittedWager = true;
    const amount = Math.floor(Math.random() * 51);
    bot.socket.emit(SOCKET_EVENTS.SUBMIT_WAGER, { amount });
    bot.wagersSubmitted += 1;
    stats.wagersSubmitted += 1;
  };

  const maybeSubmitAnswer = (optionCount) => {
    if (bot.hasAnsweredCurrentQuestion || bot.eliminated || !bot.socket?.connected) return;
    bot.hasAnsweredCurrentQuestion = true;
    const selectedOptionIndex = pickOptionIndex(optionCount);
    bot.socket.emit(SOCKET_EVENTS.SUBMIT_ANSWER, { selectedOptionIndex });
    bot.answersSubmitted += 1;
    stats.answersSubmitted += 1;
  };

  const attachHandlers = () => {
    bot.socket.on(SOCKET_EVENTS.WAGER_COLLECTION_START, () => {
      bot.hasSubmittedWager = false;
      setTimeout(() => maybeSubmitWager(), 100 + Math.random() * 400);
    });

    bot.socket.on(SOCKET_EVENTS.QUESTION_ACTIVE, (data) => {
      bot.hasAnsweredCurrentQuestion = false;
      const optionCount = data?.question?.options?.length ?? 4;
      setTimeout(() => maybeSubmitAnswer(optionCount), 150 + Math.random() * 850);
    });

    bot.socket.on(SOCKET_EVENTS.SESSION_STATE, (data) => {
      const gs = data?.gameState;
      if (!gs) return;

      if (gs.state === 'WAGER_COLLECTION' && !bot.hasSubmittedWager) {
        setTimeout(() => maybeSubmitWager(), 100 + Math.random() * 400);
      }

      if (
        gs.state === 'QUESTION' &&
        gs.questionState === 'ACTIVE' &&
        gs.currentQuestion &&
        !bot.hasAnsweredCurrentQuestion
      ) {
        const optionCount = gs.currentQuestion.question?.options?.length ?? 4;
        setTimeout(() => maybeSubmitAnswer(optionCount), 150 + Math.random() * 850);
      }
    });

    bot.socket.on(SOCKET_EVENTS.PLAYER_ELIMINATED, (payload) => {
      if (Number(payload?.teamId) === Number(bot.teamId)) {
        bot.eliminated = true;
      }
    });

    bot.socket.on(SOCKET_EVENTS.JOIN_ERROR, (err) => {
      bot.errors.push(err?.message || 'join_error');
      stats.joinFailed += 1;
    });

    bot.socket.on('connect_error', (err) => {
      bot.errors.push(err?.message || 'connect_error');
    });
  };

  bot.connectAndJoin = async () => {
    bot.socket = io(url, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 20000,
    });

    attachHandlers();
    await waitForConnect(bot.socket);

    const sessionRes = await fetch(`${url}/api/public/sessions/pin/${pin}`);
    if (!sessionRes.ok) {
      throw new Error(`Session ${pin} is not open for players (${sessionRes.status})`);
    }

    bot.socket.emit(SOCKET_EVENTS.JOIN_SESSION, { pin, teamName });
    const joinedPayload = await waitForJoin(bot.socket);
    bot.teamId = joinedPayload.teamId;
    bot.joined = true;
    stats.joined += 1;
    return bot;
  };

  bot.disconnect = () => {
    if (bot.socket) {
      bot.socket.removeAllListeners();
      bot.socket.disconnect();
      bot.socket = null;
    }
  };

  return bot;
};

module.exports = { createPlayerBot, sleep, waitForConnect };
