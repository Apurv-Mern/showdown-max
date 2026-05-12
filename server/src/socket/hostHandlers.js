const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const { GAME_STATES } = require('shared/constants/gameStates');
const { QUESTION_STATES } = require('shared/constants/questionStates');
const { ROUND_TYPES } = require('shared/constants/roundTypes');
const logger = require('../utils/logger');
const gameController = require('../services/game-engine/gameController');
const redisStore = require('../services/redisSessionStore');
const { Session, Quiz, Round, Question, Team } = require('../models');
const { normalizeTeamName, sanitizeTeamName } = require('../utils/teamName');

const purgeTeamRecord = async (pin, teamId) => {
  const team = await Team.findByPk(teamId, { attributes: ['id', 'teamName', 'socketId'] });
  const removedSocketId = team?.socketId || null;
  const removedTeamName = team?.teamName || null;
  await Team.destroy({ where: { id: teamId } });
  await redisStore.removeTeamFromLobby(pin, teamId);
  await redisStore.removeTeamData(pin, teamId);

  if (pin) {
    const existing = await redisStore.getGameState(pin);
    if (existing) {
      await redisStore.updateGameState(pin, (current) => {
        const teams = { ...(current.teams || {}) };
        delete teams[teamId];
        const activeTeamIds = (current.activeTeamIds || []).filter(
          (id) => Number(id) !== Number(teamId),
        );
        const removedTeamIds = Array.from(
          new Set([...(current.removedTeamIds || []).map(Number), Number(teamId)]),
        ).filter((id) => Number.isFinite(id));
        const removedTeamNames = Array.from(
          new Set([
            ...(current.removedTeamNames || []).map((name) => normalizeTeamName(name)),
            ...(removedTeamName ? [normalizeTeamName(removedTeamName)] : []),
          ]),
        ).filter(Boolean);
        return {
          teams,
          activeTeamIds,
          removedTeamIds,
          removedTeamNames,
          totalTeams: Object.keys(teams).length,
        };
      });
    }
  }

  return { removedSocketId };
};

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
        include: [
          {
            model: Round,
            as: 'rounds',
            include: [{ model: Question, as: 'questions' }],
          },
        ],
      });

      if (!quiz) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Quiz not found' });
        return;
      }

      const lobbyTeams = await redisStore.getLobbyTeams(pin);
      if (lobbyTeams.length === 0) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          message: 'Cannot start game with no teams. Wait for players to join.',
        });
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

  socket.on(SOCKET_EVENTS.COLLECT_WAGERS, async (data) => {
    try {
      await gameController.startWagerCollection(io, data.pin);
    } catch (err) {
      logger.error('collect_wagers error', { error: err.message });
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
      if (action === 'play') {
        const gs = await redisStore.getGameState(pin);
        if (gs?.state === GAME_STATES.QUESTION) {
          if (gs.questionState === QUESTION_STATES.REVEALED) return;
          if (gs.questionState === QUESTION_STATES.ACTIVE) {
            const tr = Number(gs.timerRemaining ?? 0);
            const round = gs.rounds?.[gs.currentRoundIndex ?? 0];
            const isMusic = round?.type === ROUND_TYPES.MUSIC;
            const musicAwaitingHostTimer =
              isMusic && !gs.timerRunning && Number.isFinite(tr) && tr > 0;
            const allowPlay = musicAwaitingHostTimer || tr > 0;
            if (!allowPlay) return;
          }
        }
      }
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

      const session = await Session.findByPk(sessionData.sessionId);
      if (!session) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Session not found in DB' });
        return;
      }

      const cleanTeamName = sanitizeTeamName(teamName);
      const normalized = normalizeTeamName(cleanTeamName);
      if (!normalized) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          message: 'Team name is required.',
        });
        return;
      }

      const gameState = await redisStore.getGameState(pin);

      const existingTeams = await Team.findAll({
        where: { sessionId: sessionData.sessionId },
        attributes: ['id', 'teamName', 'isConnected'],
      });
      const duplicateTeam = existingTeams.find((t) => normalizeTeamName(t.teamName) === normalized);
      if (duplicateTeam) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          message: 'Team name already taken. Please choose a different name.',
        });
        return;
      }

      const refreshedExistingTeams = await Team.findAll({
        where: { sessionId: sessionData.sessionId },
        attributes: ['id', 'teamName', 'isConnected'],
      });
      const maxTeams = Number(session.maxTeams || 0);
      // Only count connected teams for the session limit, not disconnected ones
      const connectedTeamCount = refreshedExistingTeams.filter((t) => t.isConnected).length;
      if (maxTeams > 0 && connectedTeamCount >= maxTeams) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          message: 'Maximum limit reached for this session.',
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

      if (gameState) {
        await redisStore.updateGameState(pin, (current) => {
          const mergedTeams = { ...(current.teams || {}), [team.id]: teamData };
          const mergedActive = [...(current.activeTeamIds || [])];
          if (!mergedActive.includes(team.id)) mergedActive.push(team.id);
          return {
            teams: mergedTeams,
            activeTeamIds: mergedActive,
            totalTeams: Object.keys(mergedTeams).length,
          };
        });
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
      const { removedSocketId } = await purgeTeamRecord(pin, teamId);

      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TEAM_REMOVED, { teamId });
      if (removedSocketId) {
        io.to(removedSocketId).emit(SOCKET_EVENTS.TEAM_REMOVED, { teamId, direct: true });
      }
      logger.info('Team removed', { pin, teamId });
    } catch (err) {
      logger.error('remove_team error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.EDIT_TEAM_SCORE, async (data) => {
    try {
      const { pin, teamId, score } = data;
      const updatedScore = Number(score);
      await Team.update({ score: updatedScore }, { where: { id: teamId } });

      const team = await Team.findByPk(teamId, {
        attributes: ['id', 'teamName', 'score', 'sessionId'],
      });
      if (!team) return;

      const teamData = {
        teamId: team.id,
        teamName: team.teamName,
        score: team.score,
      };

      await redisStore.addTeamToLobby(pin, teamData);
      await redisStore.updateTeamData(pin, teamId, teamData);

      const patched = await redisStore.updateGameState(pin, (current) => {
        const row = current.teams?.[teamId];
        if (!row) return null;
        const nextRow = { ...row, score: updatedScore };
        return { teams: { ...(current.teams || {}), [teamId]: nextRow } };
      });
      if (patched?.teams?.[teamId]) {
        await redisStore.updateTeamData(pin, teamId, patched.teams[teamId]);
      }

      // Only broadcast a focused TEAM_UPDATED event. Both the host's `onTeamUpdated` and the
      // player's `onTeamUpdated` already merge the new score into their local state without
      // touching the active question/phase. We deliberately *don't* emit a fresh
      // `session_state` here — even an enriched one — because:
      //   • on the host, `setCurrentQuestion(state==='QUESTION' ? data.currentQuestion : null)`
      //     could blank the question card during edge phases;
      //   • on the player, `onSessionState` resets `selectedOption` whenever
      //     `mySubmittedOptionIndex` is missing from the payload (and we'd have to recompute
      //     it per-team to avoid that), which previously bounced players from the
      //     "Answer Submitted" UI back to the question screen — or to "Waiting for Game to
      //     Start" — every time the host nudged a score.
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.TEAM_UPDATED, {
        teamId,
        teamName: teamData.teamName,
        score: updatedScore,
      });
      logger.info('Team score edited', { pin, teamId, score: updatedScore });
    } catch (err) {
      logger.error('edit_team_score error', { error: err.message });
    }
  });
};

module.exports = hostHandlers;
