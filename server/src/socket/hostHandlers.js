const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const logger = require('../utils/logger');
const gameController = require('../services/game-engine/gameController');
const redisStore = require('../services/redisSessionStore');
const { Session, Quiz, Round, Question, Team } = require('../models');
const { normalizeTeamName, sanitizeTeamName } = require('../utils/teamName');

/**
 * Registers host-specific socket event handlers
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
const hostHandlers = (io, socket) => {
  socket.on(SOCKET_EVENTS.START_GAME, async (data) => {
    try {
      const { pin } = data;
      const sessionData = await redisStore.getSession(pin);
      if (!sessionData) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Session not found' });
        return;
      }

      const session = await Session.findByPk(sessionData.sessionId);
      if (!session) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Session not found in DB' });
        return;
      }

      const quiz = await Quiz.findByPk(session.quizId, {
        include: [{
          model: Round,
          as: 'rounds',
          include: [{ model: Question, as: 'questions' }],
        }],
      });

      if (!quiz) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Quiz not found' });
        return;
      }

      const lobbyTeams = await redisStore.getLobbyTeams(pin);
      if (lobbyTeams.length === 0) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Cannot start game with no teams. Wait for players to join.' });
        return;
      }

      await session.update({ status: 'active' });
      await gameController.startGame(io, pin, quiz.toJSON(), session.id);
      logger.info('Game started', { pin, sessionId: session.id, teamCount: lobbyTeams.length });
    } catch (err) {
      logger.error('start_game error', { error: err.message });
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to start game' });
    }
  });

  socket.on(SOCKET_EVENTS.NEXT_QUESTION, async (data) => {
    try {
      await gameController.nextQuestion(io, data.pin);
    } catch (err) {
      logger.error('next_question error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.START_TIMER, async (data) => {
    try {
      await gameController.startTimer(io, data.pin);
    } catch (err) {
      logger.error('start_timer error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.PAUSE_TIMER, async (data) => {
    try {
      await gameController.pauseTimer(io, data.pin);
    } catch (err) {
      logger.error('pause_timer error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.REVEAL_ANSWER, async (data) => {
    try {
      await gameController.revealAnswer(io, data.pin);
    } catch (err) {
      logger.error('reveal_answer error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.SHOW_SCOREBOARD, async (data) => {
    try {
      await gameController.showScoreboard(io, data.pin);
    } catch (err) {
      logger.error('show_scoreboard error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.HIDE_SCOREBOARD, async (data) => {
    try {
      await gameController.hideScoreboard(io, data.pin);
    } catch (err) {
      logger.error('hide_scoreboard error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.ADVANCE_ROUND, async (data) => {
    try {
      await gameController.advanceToNextRound(io, data.pin);
    } catch (err) {
      logger.error('advance_round error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.START_BREAK, async (data) => {
    try {
      await gameController.startBreak(io, data.pin);
    } catch (err) {
      logger.error('start_break error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.END_BREAK, async (data) => {
    try {
      await gameController.endBreak(io, data.pin);
    } catch (err) {
      logger.error('end_break error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.LAUNCH_MINI_GAME, async (data) => {
    try {
      await gameController.launchMiniGame(io, data.pin, data.game, data.config || {});
    } catch (err) {
      logger.error('launch_mini_game error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.END_MINI_GAME, async (data) => {
    try {
      await gameController.endMiniGame(io, data.pin, data.config || {});
    } catch (err) {
      logger.error('end_mini_game error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.END_GAME, async (data) => {
    try {
      await gameController.endGame(io, data.pin);
    } catch (err) {
      logger.error('end_game error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.MUSIC_CONTROL, async (data) => {
    try {
      const { pin, action, mediaUrl } = data || {};
      if (!pin || !action) return;
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.MUSIC_CONTROL, {
        action,
        mediaUrl: mediaUrl || null,
      });
    } catch (err) {
      logger.error('music_control error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.ADD_TEAM, async (data) => {
    try {
      const { pin, teamName, score } = data;
      const sessionData = await redisStore.getSession(pin);
      if (!sessionData) return;
      const cleanTeamName = sanitizeTeamName(teamName);
      const normalized = normalizeTeamName(cleanTeamName);

      const existingTeams = await Team.findAll({
        where: { sessionId: sessionData.sessionId },
        attributes: ['teamName'],
      });
      const duplicate = existingTeams.some((t) => normalizeTeamName(t.teamName) === normalized);
      if (duplicate) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          message: 'Team name already taken. Please choose a different name.',
        });
        return;
      }

      const team = await Team.create({
        sessionId: sessionData.sessionId,
        teamName: cleanTeamName,
        score: score || 0,
      });

      const teamData = { teamId: team.id, teamName: team.teamName, score: team.score };
      await redisStore.addTeamToLobby(pin, teamData);
      await redisStore.updateTeamData(pin, team.id, teamData);

      const gameState = await redisStore.getGameState(pin);
      if (gameState) {
        gameState.teams[team.id] = teamData;
        gameState.activeTeamIds.push(team.id);
        gameState.totalTeams = Object.keys(gameState.teams).length;
        await redisStore.setGameState(pin, gameState);
      }

      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TEAM_JOINED, teamData);
      logger.info('Team added manually', { pin, teamName, score });
    } catch (err) {
      logger.error('add_team error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.REMOVE_TEAM, async (data) => {
    try {
      const { pin, teamId } = data;
      await Team.destroy({ where: { id: teamId } });
      await redisStore.removeTeamFromLobby(pin, teamId);

      const gameState = await redisStore.getGameState(pin);
      if (gameState) {
        delete gameState.teams[teamId];
        gameState.activeTeamIds = gameState.activeTeamIds.filter((id) => id !== teamId);
        gameState.totalTeams = Object.keys(gameState.teams).length;
        await redisStore.setGameState(pin, gameState);
      }

      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TEAM_REMOVED, { teamId });
      logger.info('Team removed', { pin, teamId });
    } catch (err) {
      logger.error('remove_team error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.EDIT_TEAM_SCORE, async (data) => {
    try {
      const { pin, teamId, score } = data;
      await Team.update({ score }, { where: { id: teamId } });

      const gameState = await redisStore.getGameState(pin);
      if (gameState && gameState.teams[teamId]) {
        gameState.teams[teamId].score = score;
        await redisStore.setGameState(pin, gameState);
        await redisStore.updateTeamData(pin, teamId, gameState.teams[teamId]);
      }

      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TEAM_UPDATED, { teamId, score });
      logger.info('Team score edited', { pin, teamId, score });
    } catch (err) {
      logger.error('edit_team_score error', { error: err.message });
    }
  });
};

module.exports = hostHandlers;
