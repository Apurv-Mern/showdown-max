const { Op } = require('sequelize');
const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const logger = require('../utils/logger');
const gameController = require('../services/game-engine/gameController');
const redisStore = require('../services/redisSessionStore');
const { buildRevealSnapshot } = require('../services/revealSnapshot');
const { Session, Team } = require('../models');
const { joinSessionSchema } = require('shared/schemas/session');
const { normalizeTeamName, sanitizeTeamName } = require('../utils/teamName');

/**
 * Registers player-specific socket event handlers
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
const playerHandlers = (io, socket) => {
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
        const session = await Session.findOne({
          where: { pin, status: { [Op.in]: ['pending', 'active'] } },
        });
        if (!session) {
          socket.emit(SOCKET_EVENTS.JOIN_ERROR, { message: 'Session not found' });
          return;
        }
        await redisStore.setSession(pin, session.id);
        sessionData = { sessionId: session.id };
      }

      const sessionTeams = await Team.findAll({
        where: { sessionId: sessionData.sessionId },
        attributes: ['id', 'teamName', 'isConnected', 'socketId', 'score', 'isEliminated'],
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
        // Only count connected teams for the session limit, not disconnected ones
        const teamCount = sessionTeams.filter((t) => t.isConnected).length;

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
        isEliminated: Boolean(team.isEliminated),
      };

      await redisStore.addTeamToLobby(pin, teamData);
      await redisStore.updateTeamData(pin, team.id, teamData);

      socket.join(`session:${pin}`);
      socket.data = { pin, teamId: team.id, teamName: team.teamName };

      const gameState = await redisStore.getGameState(pin);
      if (gameState) {
        const currentRound = gameState.rounds?.[gameState.currentRoundIndex];
        const isEliminationRound = currentRound?.type === 'ELIMINATION';
        const existingStateTeam = gameState.teams?.[team.id];
        const resolvedIsEliminated =
          existingStateTeam?.isEliminated ?? teamData.isEliminated ?? false;

        gameState.teams[team.id] = {
          ...teamData,
          isEliminated: resolvedIsEliminated,
        };

        if (!(isEliminationRound && resolvedIsEliminated)) {
          if (!gameState.activeTeamIds.includes(team.id)) {
            gameState.activeTeamIds.push(team.id);
          }
        }
        gameState.totalTeams = Object.keys(gameState.teams).length;
        await redisStore.setGameState(pin, gameState);
      }
      const currentRound = gameState?.rounds?.[gameState.currentRoundIndex];
      const currentQuestionRow = currentRound?.questions?.[gameState.currentQuestionIndex] || null;
      const currentQuestion =
        gameState?.state === 'QUESTION' && currentQuestionRow ? currentQuestionRow : null;

      const sessionPayload = {
        joined: true,
        teamId: team.id,
        teamName: team.teamName,
        score: team.score,
        gameState: gameState
          ? {
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
                    timerDuration:
                      currentQuestion.timerDuration || currentRound?.timerDuration || 30,
                    roundType: currentRound?.type || '',
                    lockedWagerAmount: getLockedWager(gameState, currentRound, team.id),
                  }
                : null,
              timerRemaining: gameState.timerRemaining,
              timerEndsAt: Number.isFinite(Number(gameState.timerEndsAt))
                ? Number(gameState.timerEndsAt)
                : null,
              responseCount: gameState.responseCount,
              totalTeams: gameState.totalTeams,
              activeMiniGame: gameState.activeMiniGame,
              miniGameState: gameState.miniGameState || null,
              scoreboardVisible: Boolean(gameState.scoreboardVisible),
              teams: gameState.teams,
            }
          : null,
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
            timerRemaining: Number.isFinite(Number(gameState.timerRemaining))
              ? Number(gameState.timerRemaining)
              : Number(currentQuestion.timerDuration || round.timerDuration || 30),
            timerEndsAt: Number.isFinite(Number(gameState.timerEndsAt))
              ? Number(gameState.timerEndsAt)
              : null,
            serverNow: Date.now(),
            roundType: round.type,
            lockedWagerAmount: getLockedWager(gameState, round, team.id),
          });
          socket.emit(SOCKET_EVENTS.TIMER_UPDATE, {
            remaining: Number.isFinite(Number(gameState.timerRemaining))
              ? Number(gameState.timerRemaining)
              : 0,
            timerEndsAt: Number.isFinite(Number(gameState.timerEndsAt))
              ? Number(gameState.timerEndsAt)
              : null,
            serverNow: Date.now(),
          });
        }
        if (gameState.state === 'QUESTION' && gameState.questionState === 'REVEALED') {
          const revealPayload = await buildRevealSnapshot(pin, gameState);
          if (revealPayload) {
            socket.emit(SOCKET_EVENTS.ANSWER_REVEAL, revealPayload);
            socket.emit(SOCKET_EVENTS.TIMER_UPDATE, { remaining: 0 });
          }
        }
        if (gameState.state === 'SCOREBOARD') {
          const revealSnapshot = await buildRevealSnapshot(pin, gameState);
          socket.emit(SOCKET_EVENTS.SCOREBOARD, {
            teams: Object.values(gameState.teams).sort((a, b) => b.score - a.score),
            ...(revealSnapshot ? { revealSnapshot } : {}),
          });
        }
        if (gameState.scoreboardVisible && gameState.state !== 'SCOREBOARD') {
          const revealSnapshot = await buildRevealSnapshot(pin, gameState);
          socket.emit(SOCKET_EVENTS.SCOREBOARD, {
            teams: Object.values(gameState.teams).sort((a, b) => b.score - a.score),
            source: 'manual',
            ...(revealSnapshot ? { revealSnapshot } : {}),
          });
        }
        if (gameState.state === 'BREAK') {
          socket.emit(SOCKET_EVENTS.BREAK_START, {
            duration: gameState.breakRemaining || gameState.breakDuration,
          });
        }
        if (gameState.activeMiniGame) {
          socket.emit(SOCKET_EVENTS.MINI_GAME_START, { game: gameState.activeMiniGame });
          if (
            gameState.miniGameState?.game === 'card_shuffle' &&
            gameState.miniGameState?.revealed
          ) {
            socket.emit(SOCKET_EVENTS.MINI_GAME_REVEAL, {
              game: 'card_shuffle',
              correctPosition: Number(gameState.miniGameState.correctPosition),
              roundNumber: gameState.miniGameState.activeRound || undefined,
              cardPositions: Array.isArray(gameState.miniGameState.cardPositions)
                ? gameState.miniGameState.cardPositions
                : [],
            });
            const selectedChoiceRaw = gameState.miniGameState.selections?.[String(team.id)];
            const selectedChoice = Number.isFinite(Number(selectedChoiceRaw))
              ? Number(selectedChoiceRaw)
              : null;
            const correctPosition = Number(gameState.miniGameState.correctPosition);
            socket.emit(SOCKET_EVENTS.MINI_GAME_PLAYER_RESULT, {
              game: 'card_shuffle',
              result: selectedChoice === correctPosition ? 'winner' : 'loser',
              correctPosition,
              selectedChoice,
              roundNumber: gameState.miniGameState.activeRound || undefined,
            });
          }
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

      await gameController.handlePlayerSocketDisconnect(io, pin, teamId);

      socket.leave(`session:${pin}`);
      socket.data = {};

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

      await gameController.handlePlayerSocketDisconnect(io, pin, teamId);

      logger.info('Player disconnected', { pin, teamId });
    } catch (err) {
      logger.error('disconnect handler error', { error: err.message });
    }
  });
};

module.exports = playerHandlers;
