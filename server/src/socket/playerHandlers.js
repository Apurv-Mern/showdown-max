const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const logger = require('../utils/logger');
const gameController = require('../services/game-engine/gameController');
const redisStore = require('../services/redisSessionStore');
const {
  getMySubmittedOptionIndex,
  buildSessionPayloadForPlayer,
  buildJoinReplayEvents,
  emitJoinReplaysToSocket,
} = require('../services/playerRestorePayload');
const { Session, Team } = require('../models');
const sessionService = require('../services/sessionService');
const { joinSessionSchema } = require('shared/schemas/session');
const { normalizeTeamName, sanitizeTeamName } = require('../utils/teamName');

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

      const { pin, teamName, teamId: reclaimTeamId } = parsed.data;
      const cleanTeamName = sanitizeTeamName(teamName);
      const normalizedTeamName = normalizeTeamName(cleanTeamName);

      const hostReadySession = await sessionService.getPlayerJoinEligibleSessionByPin(pin);
      if (!hostReadySession) {
        socket.emit(SOCKET_EVENTS.JOIN_ERROR, {
          message:
            'This session is not open yet. The PIN may be wrong, the show may have ended, or no host is assigned for this session yet.',
          code: 'NO_ASSIGNED_HOST',
        });
        return;
      }

      let sessionData = await redisStore.getSession(pin);
      if (!sessionData) {
        await redisStore.setSession(pin, hostReadySession.id);
        sessionData = { sessionId: hostReadySession.id };
      }

      const sessionTeams = await Team.findAll({
        where: { sessionId: sessionData.sessionId },
        attributes: ['id', 'teamName', 'isConnected', 'socketId', 'score', 'isEliminated'],
      });
      const preJoinGameState = await require('../services/sessionCheckpointService').ensureHydratedGameState(
        pin,
      );
      const hostRemovalBlocklist = await redisStore.getHostRemovalBlocklist(pin);
      const existingTeam = sessionTeams.find(
        (t) => normalizeTeamName(t.teamName) === normalizedTeamName,
      );
      const nameMarkedRemoved =
        hostRemovalBlocklist.teamNames.includes(normalizedTeamName) ||
        (Array.isArray(preJoinGameState?.removedTeamNames) &&
          preJoinGameState.removedTeamNames
            .map((name) => normalizeTeamName(name))
            .includes(normalizedTeamName));
      // If the host re-added this team (DB row exists), allow join/reconnect.
      const wasRemovedByHost = !existingTeam && nameMarkedRemoved;
      if (wasRemovedByHost) {
        socket.emit(SOCKET_EVENTS.TEAM_REMOVED, {
          teamName: cleanTeamName,
          reason: 'removed_by_host',
        });
        socket.emit(SOCKET_EVENTS.JOIN_ERROR, {
          message: 'You have been removed from this game by the host.',
          code: 'TEAM_REMOVED',
        });
        return;
      }

      const disconnectStalePlayerSocket = (staleSocketId) => {
        if (!staleSocketId || staleSocketId === socket.id) return;
        const stale = io.sockets.sockets.get(staleSocketId);
        if (stale?.connected) stale.disconnect(true);
      };

      let team;
      if (existingTeam) {
        const isSameSocket = existingTeam.socketId === socket.id;
        const isOwnTeamReconnect =
          reclaimTeamId != null && Number(reclaimTeamId) === Number(existingTeam.id);

        if (
          !isSameSocket &&
          !isOwnTeamReconnect &&
          existingTeam.isConnected &&
          existingTeam.socketId
        ) {
          const existingSocket = io.sockets.sockets.get(existingTeam.socketId);
          if (existingSocket?.connected) {
            socket.emit(SOCKET_EVENTS.JOIN_ERROR, {
              message: 'Team name already taken. Please choose a different name.',
              code: 'TEAM_NAME_TAKEN',
            });
            return;
          }
        }

        if (!isSameSocket && existingTeam.socketId) {
          disconnectStalePlayerSocket(existingTeam.socketId);
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

      // The DB row read by `Team.findByPk` lags behind Redis whenever `persistScoresToDB` is
      // still in-flight (it's fire-and-forget after each reveal). When a player refreshes
      // mid-game we must not overwrite the live Redis score with the stale DB value — that
      // shows up to the player as their score "resetting to zero" right after a refresh.
      // Read whatever we already have in Redis first, then merge the live score back in.
      const existingGameState = preJoinGameState || (await redisStore.getGameState(pin));
      const existingStateTeamPre =
        existingGameState?.teams?.[team.id] ?? existingGameState?.teams?.[String(team.id)] ?? null;
      const liveScoreRaw = existingStateTeamPre?.score;
      const liveScoreIsValid =
        liveScoreRaw !== undefined &&
        liveScoreRaw !== null &&
        Number.isFinite(Number(liveScoreRaw));
      const preservedScore = liveScoreIsValid ? Number(liveScoreRaw) : Number(team.score) || 0;
      const preservedIsEliminated =
        existingStateTeamPre?.isEliminated !== undefined
          ? Boolean(existingStateTeamPre.isEliminated)
          : Boolean(team.isEliminated);

      const teamData = {
        teamId: team.id,
        teamName: team.teamName,
        score: preservedScore,
        isEliminated: preservedIsEliminated,
        isConnected: true,
      };

      await redisStore.addTeamToLobby(pin, teamData);
      await redisStore.updateTeamData(pin, team.id, teamData);

      socket.join(`session:${pin}`);
      socket.data = { pin, teamId: team.id, teamName: team.teamName };
      gameController.cancelScheduledDisconnectPurge(pin, team.id);

      let gameState = existingGameState;
      if (gameState) {
        const merged = await redisStore.updateGameState(pin, (current) => {
          const currentRound = current.rounds?.[current.currentRoundIndex];
          const isEliminationRound = currentRound?.type === 'ELIMINATION';
          const existingStateTeam = current.teams?.[team.id];
          const resolvedIsEliminated =
            existingStateTeam?.isEliminated ?? teamData.isEliminated ?? false;

          const mergedTeams = {
            ...(current.teams || {}),
            [team.id]: {
              ...(existingStateTeam || {}),
              ...teamData,
              isEliminated: resolvedIsEliminated,
            },
          };

          let mergedActiveTeamIds = [...(current.activeTeamIds || [])];
          if (
            !(isEliminationRound && resolvedIsEliminated) &&
            !mergedActiveTeamIds.includes(team.id)
          ) {
            mergedActiveTeamIds.push(team.id);
          }

          return {
            teams: mergedTeams,
            activeTeamIds: mergedActiveTeamIds,
            totalTeams: Object.keys(mergedTeams).length,
          };
        });
        if (merged) gameState = merged;
      }
      const roundForSubmitted = gameState?.rounds?.[gameState.currentRoundIndex];
      const questionRowForSubmitted =
        roundForSubmitted?.questions?.[gameState.currentQuestionIndex] || null;
      const questionForSubmitted =
        gameState?.state === 'QUESTION' && questionRowForSubmitted ? questionRowForSubmitted : null;

      let mySubmittedOptionIndex = null;
      if (
        gameState?.state === 'QUESTION' &&
        (gameState?.questionState === 'ACTIVE' || gameState?.questionState === 'REVEALED') &&
        questionForSubmitted?.id &&
        team?.id != null
      ) {
        mySubmittedOptionIndex = await getMySubmittedOptionIndex(
          pin,
          questionForSubmitted.id,
          team.id,
        );
      }

      // Fresh snapshot: async work above can overlap with host timer ticks / MUSIC resume, and
      // Sequelize `team.score` can lag behind live scores in Redis `gameState.teams`.
      if (gameState) {
        const refreshed = await redisStore.getGameState(pin);
        if (refreshed) gameState = refreshed;
      }

      const sessionPayload = await buildSessionPayloadForPlayer({
        pin,
        gameState,
        team,
        mySubmittedOptionIndex,
      });

      socket.emit(SOCKET_EVENTS.SESSION_STATE, sessionPayload);

      if (gameState && gameState.state !== 'LOBBY') {
        const replays = await buildJoinReplayEvents({
          pin,
          gameState,
          team,
          mySubmittedOptionIndex,
        });
        emitJoinReplaysToSocket(socket, replays);
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

      // Explicit leave: purge immediately (no reconnect grace window).
      await gameController.handlePlayerSocketDisconnect(io, pin, teamId, { immediate: true });

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
      await gameController.submitWager(io, pin, teamId, data?.amount);
      logger.debug('Player submitted wager', { teamId, amount: data?.amount });
    } catch (err) {
      logger.error('submit_wager error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.DISCONNECT, async () => {
    try {
      const { pin, teamId } = socket.data || {};
      if (!pin || !teamId) return;

      await gameController.handlePlayerSocketDisconnect(io, pin, teamId, {
        disconnectingSocketId: socket.id,
      });

      logger.info('Player disconnected', { pin, teamId });
    } catch (err) {
      logger.error('disconnect handler error', { error: err.message });
    }
  });
};

module.exports = playerHandlers;
