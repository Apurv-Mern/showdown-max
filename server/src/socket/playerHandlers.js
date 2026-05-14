const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const logger = require('../utils/logger');
const gameController = require('../services/game-engine/gameController');
const timerManager = require('../services/game-engine/timerManager');
const { getBreakRemainingSeconds } = require('../utils/breakWallClock');
const redisStore = require('../services/redisSessionStore');

/** `Number(null) === 0` would falsely mark the timer as expired — only positive epoch ms are valid. */
const safeClientTimerEndsAt = (raw) => {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};
const { buildRevealSnapshot } = require('../services/revealSnapshot');
const { Session, Team } = require('../models');
const sessionService = require('../services/sessionService');
const { joinSessionSchema } = require('shared/schemas/session');
const { normalizeTeamName, sanitizeTeamName } = require('../utils/teamName');

/** Restore locked selection on mobile after refresh (Redis may store a number or JSON). */
const getMySubmittedOptionIndex = async (pin, questionId, teamId) => {
  if (!questionId || teamId == null) return null;
  try {
    const raw = await redisStore.getResponses(pin, questionId);
    const entry = raw[String(teamId)];
    if (entry === undefined || entry === null || entry === '') return null;
    const asNum = Number(entry);
    if (Number.isFinite(asNum)) return asNum;
    const parsed = JSON.parse(String(entry));
    if (Array.isArray(parsed?.selectedOptionIndex)) {
      return parsed.selectedOptionIndex;
    }
    const idx = Number(parsed?.selectedOptionIndex);
    return Number.isFinite(idx) ? idx : null;
  } catch {
    return null;
  }
};

/**
 * Registers player-specific socket event handlers
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
const playerHandlers = (io, socket) => {
  const getLockedWager = (gameState, round, teamId) => {
    if (!gameState || !round || (round.type !== 'WAGER' && round.type !== 'FINAL_WAGER')) {
      return null;
    }
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
      const preJoinGameState = await redisStore.getGameState(pin);
      const wasRemovedByHost =
        Array.isArray(preJoinGameState?.removedTeamNames) &&
        preJoinGameState.removedTeamNames.map((name) => normalizeTeamName(name)).includes(normalizedTeamName);
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
          if (!(isEliminationRound && resolvedIsEliminated) && !mergedActiveTeamIds.includes(team.id)) {
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
        gameState?.questionState === 'ACTIVE' &&
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

      const currentRound = gameState?.rounds?.[gameState.currentRoundIndex];
      const currentQuestionRow = currentRound?.questions?.[gameState.currentQuestionIndex] || null;
      const currentQuestion =
        gameState?.state === 'QUESTION' && currentQuestionRow ? currentQuestionRow : null;

      const redisTeamRow =
        gameState?.teams?.[team.id] ?? gameState?.teams?.[String(team.id)] ?? null;
      const redisScoreRaw = redisTeamRow?.score;
      const resolvedJoinScore =
        redisScoreRaw !== undefined &&
        redisScoreRaw !== null &&
        Number.isFinite(Number(redisScoreRaw))
          ? Number(redisScoreRaw)
          : Number(team.score) || 0;

      const sessionPayload = {
        joined: true,
        teamId: team.id,
        teamName: team.teamName,
        score: resolvedJoinScore,
        gameState: gameState
          ? {
              state: gameState.state,
              questionState: gameState.questionState,
              currentRoundIndex: gameState.currentRoundIndex,
              currentQuestionIndex: gameState.currentQuestionIndex,
              totalRounds: gameState.rounds?.length || 0,
              currentRound: currentRound
                ? {
                    id: currentRound.id,
                    name: currentRound.name,
                    type: currentRound.type,
                    timerDuration: currentRound.timerDuration,
                  }
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
                      Number(currentQuestion.timerDuration ?? currentRound?.timerDuration ?? 30) ||
                      30,
                    roundType: currentRound?.type || '',
                    lockedWagerAmount: getLockedWager(gameState, currentRound, team.id),
                  }
                : null,
              timerRemaining: timerManager.getReconnectTimerRemaining(pin, gameState),
              timerRunning: Boolean(gameState.timerRunning),
              timerEndsAt: safeClientTimerEndsAt(gameState.timerEndsAt),
              mySubmittedOptionIndex,
              responseCount: gameState.responseCount,
              totalTeams: gameState.totalTeams,
              activeMiniGame: gameState.activeMiniGame,
              miniGameState: gameState.miniGameState || null,
              scoreboardVisible: Boolean(gameState.scoreboardVisible),
              teams: gameState.teams,
              // Per-joining-team: used when state is WAGER_COLLECTION (no currentQuestion in payload)
              // so mobile can restore a locked wager after refresh/reconnect.
              lockedWagerAmount:
                currentRound &&
                (currentRound.type === 'WAGER' || currentRound.type === 'FINAL_WAGER')
                  ? getLockedWager(gameState, currentRound, team.id)
                  : null,
              ...(gameState.state === 'BREAK'
                ? {
                    breakDuration: Math.max(
                      0,
                      Math.round(Number(gameState.breakDuration ?? 360)),
                    ),
                    breakRemaining: getBreakRemainingSeconds(gameState),
                    breakEndsAt:
                      Number.isFinite(Number(gameState.breakEndsAt)) &&
                      Number(gameState.breakEndsAt) > 0
                        ? Number(gameState.breakEndsAt)
                        : undefined,
                    serverNow: Date.now(),
                  }
                : {}),
            }
          : null,
      };

      socket.emit(SOCKET_EVENTS.SESSION_STATE, sessionPayload);

      const eliminatedTeamIdsForPayload = gameState
        ? Object.values(gameState.teams || {})
            .filter((t) => t && t.isEliminated)
            .map((t) => Number(t.teamId))
            .filter((id) => Number.isFinite(id))
        : [];

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
            timerDuration:
              Number(currentQuestion.timerDuration ?? round.timerDuration ?? 30) || 30,
            timerRemaining: timerManager.getReconnectTimerRemaining(pin, gameState),
            timerRunning: Boolean(gameState.timerRunning),
            timerEndsAt: safeClientTimerEndsAt(gameState.timerEndsAt),
            serverNow: Date.now(),
            roundType: round.type,
            lockedWagerAmount: getLockedWager(gameState, round, team.id),
            mySubmittedOptionIndex,
            eliminatedTeamIds: eliminatedTeamIdsForPayload,
          });
          socket.emit(SOCKET_EVENTS.TIMER_UPDATE, {
            remaining: timerManager.getReconnectTimerRemaining(pin, gameState),
            timerRunning: Boolean(gameState.timerRunning),
            timerEndsAt: safeClientTimerEndsAt(gameState.timerEndsAt),
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
          const bd = Math.max(0, Math.round(Number(gameState.breakDuration ?? 360)));
          const br = getBreakRemainingSeconds(gameState);
          const serverNow = Date.now();
          socket.emit(SOCKET_EVENTS.BREAK_START, {
            duration: br,
            breakDuration: bd,
            breakRemaining: br,
            breakEndsAt:
              Number.isFinite(Number(gameState.breakEndsAt)) && Number(gameState.breakEndsAt) > 0
                ? Number(gameState.breakEndsAt)
                : undefined,
            serverNow,
          });
        }
        if (gameState.activeMiniGame) {
          socket.emit(SOCKET_EVENTS.MINI_GAME_START, {
            game: gameState.activeMiniGame,
            ...(gameState.miniGameConfig || {}),
          });
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
          if (
            gameState.miniGameState?.game === 'kangaroo_race' &&
            gameState.miniGameState?.revealed &&
            Array.isArray(gameState.miniGameState?.finishOrder) &&
            gameState.miniGameState.finishOrder.length > 0
          ) {
            const finishOrder = gameState.miniGameState.finishOrder
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value));
            const winningKangaroo = Number(finishOrder[0]);
            const kangarooNames = Array.isArray(gameState.miniGameState.kangarooNames)
              ? gameState.miniGameState.kangarooNames
              : Array.isArray(gameState.miniGameConfig?.kangarooNames)
                ? gameState.miniGameConfig.kangarooNames
                : [];
            socket.emit(SOCKET_EVENTS.MINI_GAME_REVEAL, {
              game: 'kangaroo_race',
              winningKangaroo,
              finishOrder,
              kangarooNames,
              pointsByRank: [50, 40, 30, 20, 10, 0],
            });
            const selectedChoiceRaw = gameState.miniGameState.selections?.[String(team.id)];
            const selectedChoice = Number.isFinite(Number(selectedChoiceRaw))
              ? Number(selectedChoiceRaw)
              : null;
            const finishRank =
              selectedChoice != null ? finishOrder.findIndex((slot) => slot === selectedChoice) + 1 : 0;
            const pointsByRank = [50, 40, 30, 20, 10, 0];
            const pointsEarned =
              finishRank >= 1 && finishRank <= pointsByRank.length ? pointsByRank[finishRank - 1] : 0;
            socket.emit(SOCKET_EVENTS.MINI_GAME_PLAYER_RESULT, {
              game: 'kangaroo_race',
              result: pointsEarned === pointsByRank[0] ? 'winner' : 'loser',
              winningKangaroo,
              finishOrder,
              selectedChoice,
              finishRank: finishRank || null,
              pointsEarned,
              kangarooNames,
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

      // Explicit leave: purge immediately (no grace window — same as host remove).
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

