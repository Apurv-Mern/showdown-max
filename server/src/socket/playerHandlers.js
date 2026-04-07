const { Op } = require('sequelize');
const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const logger = require('../utils/logger');
const gameController = require('../services/game-engine/gameController');
const redisStore = require('../services/redisSessionStore');
const { Session, Team } = require('../models');
const { joinSessionSchema } = require('shared/schemas/session');
const { normalizeTeamName, sanitizeTeamName } = require('../utils/teamName');

/**
 * Registers player-specific socket event handlers
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
const playerHandlers = (io, socket) => {
  const parseStoredResponse = (raw) => {
    if (!raw) return { selectedOptionIndex: -1, responseTime: null };
    try {
      const parsed = JSON.parse(raw);
      const selectedOptionIndex = Number(parsed.selectedOptionIndex);
      const responseTime = Number(parsed.responseTime);
      return {
        selectedOptionIndex: Number.isFinite(selectedOptionIndex) ? selectedOptionIndex : -1,
        responseTime: Number.isFinite(responseTime) ? responseTime : null,
      };
    } catch {
      const selectedOptionIndex = Number(raw);
      return {
        selectedOptionIndex: Number.isFinite(selectedOptionIndex) ? selectedOptionIndex : -1,
        responseTime: null,
      };
    }
  };

  const buildReconnectRevealPayload = async (pin, gameState, currentQuestion) => {
    const responsesRaw = currentQuestion?.id
      ? await redisStore.getResponses(pin, currentQuestion.id)
      : {};
    const teams = Object.values(gameState.teams || {}).map((team) => ({
      teamId: Number(team.teamId),
      teamName: String(team.teamName || ''),
      score: Number(team.score || 0),
      isEliminated: Boolean(team.isEliminated),
    }));
    const responseDetails = teams.map((team) => {
      const parsed = parseStoredResponse(responsesRaw[String(team.teamId)]);
      return {
        teamId: team.teamId,
        selectedOptionIndex: parsed.selectedOptionIndex,
        responseTime: parsed.responseTime,
      };
    });
    const correctOptionIndex = (currentQuestion?.options || []).findIndex((o) => o?.isCorrect);
    const allWrong =
      correctOptionIndex < 0
        ? true
        : responseDetails.every((r) => r.selectedOptionIndex !== correctOptionIndex);

    return {
      correctOptionIndex,
      correctText: currentQuestion?.options?.[correctOptionIndex]?.text || '',
      scores: {},
      responseDetails,
      eliminations: teams.filter((t) => t.isEliminated).map((t) => t.teamId),
      allWrong,
      teams,
    };
  };

  const getLockedWager = (gameState, round, teamId) => {
    if (!gameState || !round || round.type !== 'WAGER') return null;
    const value = gameState.roundWagers?.[String(round.id)]?.[String(teamId)];
    if (value === undefined || value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  socket.on(SOCKET_EVENTS.JOIN_SESSION, async (data) => {
    try {
      const parsed = joinSessionSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit(SOCKET_EVENTS.JOIN_ERROR, { message: 'Invalid PIN or team name' });
        return;
      }

      const { pin, teamName } = parsed.data;
      const cleanTeamName = sanitizeTeamName(teamName);
      const normalizedTeamName = normalizeTeamName(cleanTeamName);
      let sessionData = await redisStore.getSession(pin);

      if (!sessionData) {
        const session = await Session.findOne({ where: { pin, status: { [Op.in]: ['pending', 'active'] } } });
        if (!session) {
          socket.emit(SOCKET_EVENTS.JOIN_ERROR, { message: 'Session not found' });
          return;
        }
        await redisStore.setSession(pin, session.id);
        sessionData = { sessionId: session.id };
      }

      const sessionTeams = await Team.findAll({
        where: { sessionId: sessionData.sessionId },
        attributes: ['id', 'teamName', 'isConnected', 'socketId', 'score'],
      });
      const existingTeam = sessionTeams.find(
        (t) => normalizeTeamName(t.teamName) === normalizedTeamName,
      );

      let team;
      if (existingTeam) {
        if (existingTeam.isConnected && existingTeam.socketId) {
          const existingSocket = io.sockets.sockets.get(existingTeam.socketId);
          if (existingSocket && existingSocket.connected) {
            socket.emit(SOCKET_EVENTS.JOIN_ERROR, {
              message: 'Team name already taken. Please choose a different name.',
            });
            return;
          }
        }
        team = existingTeam;
        await team.update({ isConnected: true, socketId: socket.id });
        logger.info('Player reconnected', { pin, teamName: team.teamName, teamId: team.id });
      } else {
        const session = await Session.findByPk(sessionData.sessionId);
        const teamCount = sessionTeams.length;

        if (session && teamCount >= session.maxTeams) {
          socket.emit(SOCKET_EVENTS.JOIN_ERROR, { message: 'Session is full' });
          return;
        }

        team = await Team.create({
          sessionId: sessionData.sessionId,
          teamName: cleanTeamName,
          socketId: socket.id,
        });
      }

      const teamData = {
        teamId: team.id,
        teamName: team.teamName,
        score: team.score,
      };

      await redisStore.addTeamToLobby(pin, teamData);
      await redisStore.updateTeamData(pin, team.id, teamData);

      socket.join(`session:${pin}`);
      socket.data = { pin, teamId: team.id, teamName: team.teamName };

      const gameState = await redisStore.getGameState(pin);
      if (gameState) {
        gameState.teams[team.id] = teamData;
        if (!gameState.activeTeamIds.includes(team.id)) {
          gameState.activeTeamIds.push(team.id);
        }
        gameState.totalTeams = Object.keys(gameState.teams).length;
        await redisStore.setGameState(pin, gameState);
      }
      const currentRound = gameState?.rounds?.[gameState.currentRoundIndex];
      const currentQuestion = currentRound?.questions?.[gameState.currentQuestionIndex] || null;

      const sessionPayload = {
        joined: true,
        teamId: team.id,
        teamName: team.teamName,
        score: team.score,
        gameState: gameState ? {
          state: gameState.state,
          questionState: gameState.questionState,
          currentRoundIndex: gameState.currentRoundIndex,
          currentQuestionIndex: gameState.currentQuestionIndex,
          totalRounds: gameState.rounds?.length || 0,
          currentRound: currentRound
            ? { name: currentRound.name, type: currentRound.type }
            : null,
          currentQuestion: currentQuestion
            ? {
                questionIndex: gameState.currentQuestionIndex,
                totalQuestions: currentRound?.questions?.length || 0,
                question: {
                  id: currentQuestion.id,
                  text: currentQuestion.text,
                  options: (currentQuestion.options || []).map((o) => ({ text: o.text })),
                  mediaUrl: currentQuestion.mediaUrl,
                  mediaType: currentQuestion.mediaType,
                },
                timerDuration: currentQuestion.timerDuration || currentRound?.timerDuration || 30,
                roundType: currentRound?.type || '',
                lockedWagerAmount: getLockedWager(gameState, currentRound, team.id),
              }
            : null,
          timerRemaining: gameState.timerRemaining,
          responseCount: gameState.responseCount,
          totalTeams: gameState.totalTeams,
          activeMiniGame: gameState.activeMiniGame,
          teams: gameState.teams,
        } : null,
      };

      socket.emit(SOCKET_EVENTS.SESSION_STATE, sessionPayload);

      if (gameState && gameState.state !== 'LOBBY') {
        const round = gameState.rounds?.[gameState.currentRoundIndex];
        if (gameState.state === 'ROUND_INTRO' && round) {
          socket.emit(SOCKET_EVENTS.ROUND_INTRO, {
            round: { name: round.name, type: round.type },
            roundIndex: gameState.currentRoundIndex,
            totalRounds: gameState.rounds.length,
          });
        }
        if (
          gameState.state === 'QUESTION' &&
          gameState.questionState === 'ACTIVE' &&
          round &&
          currentQuestion
        ) {
          socket.emit(SOCKET_EVENTS.QUESTION_ACTIVE, {
            questionIndex: gameState.currentQuestionIndex,
            totalQuestions: round.questions.length,
            question: {
              id: currentQuestion.id,
              text: currentQuestion.text,
              options: (currentQuestion.options || []).map((o) => ({ text: o.text })),
              mediaUrl: currentQuestion.mediaUrl,
              mediaType: currentQuestion.mediaType,
            },
            timerDuration: currentQuestion.timerDuration || round.timerDuration || 30,
            roundType: round.type,
            lockedWagerAmount: getLockedWager(gameState, round, team.id),
          });
          socket.emit(SOCKET_EVENTS.TIMER_UPDATE, { remaining: gameState.timerRemaining });
        }
        if (
          gameState.state === 'QUESTION' &&
          gameState.questionState === 'REVEALED' &&
          currentQuestion
        ) {
          const revealPayload = await buildReconnectRevealPayload(pin, gameState, currentQuestion);
          socket.emit(SOCKET_EVENTS.ANSWER_REVEAL, revealPayload);
          socket.emit(SOCKET_EVENTS.TIMER_UPDATE, { remaining: 0 });
        }
        if (gameState.state === 'SCOREBOARD') {
          socket.emit(SOCKET_EVENTS.SCOREBOARD, {
            teams: Object.values(gameState.teams).sort((a, b) => b.score - a.score),
          });
        }
        if (gameState.state === 'BREAK') {
          socket.emit(SOCKET_EVENTS.BREAK_START, { duration: gameState.breakRemaining || gameState.breakDuration });
        }
        if (gameState.activeMiniGame) {
          socket.emit(SOCKET_EVENTS.MINI_GAME_START, { game: gameState.activeMiniGame });
        }
        if (gameState.state === 'FINAL_RESULTS') {
          socket.emit(SOCKET_EVENTS.GAME_END, {
            teams: Object.values(gameState.teams).sort((a, b) => b.score - a.score),
          });
        }
      }

      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TEAM_JOINED, teamData);
      logger.info('Player joined', {
        pin,
        teamName: team.teamName,
        teamId: team.id,
        isReconnect: !!existingTeam,
      });
    } catch (err) {
      logger.error('join_session error', { error: err.message, stack: err.stack });
      socket.emit(SOCKET_EVENTS.JOIN_ERROR, { message: 'Failed to join session' });
    }
  });

  socket.on(SOCKET_EVENTS.LEAVE_SESSION, async () => {
    try {
      const { pin, teamId, teamName } = socket.data || {};
      if (!pin || !teamId) return;

      await Team.update({ isConnected: false, socketId: null }, { where: { id: teamId } });

      const gameState = await redisStore.getGameState(pin);
      if (gameState && gameState.teams[teamId]) {
        gameState.teams[teamId].isConnected = false;
        await redisStore.setGameState(pin, gameState);
      }

      socket.leave(`session:${pin}`);
      socket.data = {};

      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TEAM_REMOVED, { teamId });
      socket.emit(SOCKET_EVENTS.SESSION_STATE, { left: true });
      logger.info('Player left session', { pin, teamId, teamName });
    } catch (err) {
      logger.error('leave_session error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.SUBMIT_ANSWER, async (data) => {
    try {
      const { pin, teamId } = socket.data || {};
      if (!pin || !teamId) return;

      await gameController.submitAnswer(io, pin, teamId, {
        selectedOptionIndex: data.selectedOptionIndex,
        wagerAmount: data.wagerAmount,
      });
    } catch (err) {
      logger.error('submit_answer error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.SUBMIT_WAGER, async (data) => {
    try {
      const { pin, teamId } = socket.data || {};
      if (!pin || !teamId) return;
      await gameController.submitWager(pin, teamId, data?.amount);
      logger.debug('Player submitted wager', { teamId, amount: data?.amount });
    } catch (err) {
      logger.error('submit_wager error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.DISCONNECT, async () => {
    try {
      const { pin, teamId } = socket.data || {};
      if (!pin || !teamId) return;

      await Team.update({ isConnected: false, socketId: null }, { where: { id: teamId } });

      const gameState = await redisStore.getGameState(pin);
      if (gameState && gameState.teams[teamId]) {
        gameState.teams[teamId].isConnected = false;
        await redisStore.setGameState(pin, gameState);
      }

      logger.info('Player disconnected', { pin, teamId });
    } catch (err) {
      logger.error('disconnect handler error', { error: err.message });
    }
  });
};

module.exports = playerHandlers;
