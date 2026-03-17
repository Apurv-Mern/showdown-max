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
        team = existingTeam;
        await team.update({ isConnected: true, socketId: socket.id });
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

      socket.emit(SOCKET_EVENTS.SESSION_STATE, {
        joined: true,
        teamId: team.id,
        teamName: team.teamName,
        score: team.score,
        gameState: gameState ? { state: gameState.state, questionState: gameState.questionState } : null,
      });

      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TEAM_JOINED, teamData);
      logger.info('Player joined', { pin, teamName, teamId: team.id });
    } catch (err) {
      logger.error('join_session error', { error: err.message, stack: err.stack });
      socket.emit(SOCKET_EVENTS.JOIN_ERROR, { message: 'Failed to join session' });
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
