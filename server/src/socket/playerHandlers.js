const { Op } = require('sequelize');
const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const logger = require('../utils/logger');
const gameController = require('../services/game-engine/gameController');
const redisStore = require('../services/redisSessionStore');
const { Session, Team } = require('../models');
const { joinSessionSchema } = require('shared/schemas/session');

/**
 * Registers player-specific socket event handlers
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
const playerHandlers = (io, socket) => {
  socket.on(SOCKET_EVENTS.JOIN_SESSION, async (data) => {
    try {
      const parsed = joinSessionSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit(SOCKET_EVENTS.JOIN_ERROR, { message: 'Invalid PIN or team name' });
        return;
      }

      const { pin, teamName } = parsed.data;
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

      const existingTeam = await Team.findOne({
        where: { sessionId: sessionData.sessionId, teamName },
      });

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
        logger.info('Player reconnected', { pin, teamName, teamId: team.id });
      } else {
        const session = await Session.findByPk(sessionData.sessionId);
        const teamCount = await Team.count({ where: { sessionId: sessionData.sessionId } });

        if (session && teamCount >= session.maxTeams) {
          socket.emit(SOCKET_EVENTS.JOIN_ERROR, { message: 'Session is full' });
          return;
        }

        team = await Team.create({
          sessionId: sessionData.sessionId,
          teamName,
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
          timerRemaining: gameState.timerRemaining,
          activeMiniGame: gameState.activeMiniGame,
        } : null,
      };

      socket.emit(SOCKET_EVENTS.SESSION_STATE, sessionPayload);

      if (gameState && gameState.state !== 'LOBBY') {
        const round = gameState.rounds?.[gameState.currentRoundIndex];
        if (round) {
          socket.emit(SOCKET_EVENTS.ROUND_INTRO, {
            round: { name: round.name, type: round.type },
            roundIndex: gameState.currentRoundIndex,
            totalRounds: gameState.rounds.length,
          });
        }
        if (gameState.state === 'BREAK') {
          socket.emit(SOCKET_EVENTS.BREAK_START, { duration: gameState.breakRemaining || gameState.breakDuration });
        }
        if (gameState.activeMiniGame) {
          socket.emit(SOCKET_EVENTS.MINI_GAME_START, { game: gameState.activeMiniGame });
        }
      }

      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TEAM_JOINED, teamData);
      logger.info('Player joined', { pin, teamName, teamId: team.id, isReconnect: !!existingTeam });
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

      logger.debug('Player submitted wager', { teamId, amount: data.amount });
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
