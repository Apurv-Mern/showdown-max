const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const { ROUND_TYPES } = require('shared/constants/roundTypes');
const { getEliminationPoints } = require('shared/constants/scoring');
const timerManager = require('./game-engine/timerManager');
const { getBreakRemainingSeconds, getBreakUpNextRoundPayload } = require('../utils/breakWallClock');
const redisStore = require('./redisSessionStore');
const { buildRevealSnapshot } = require('./revealSnapshot');
const { Team } = require('../models');
const sessionService = require('./sessionService');
const { normalizeTeamName } = require('../utils/teamName');

/** `Number(null) === 0` would falsely mark the timer as expired — only positive epoch ms are valid. */
const safeClientTimerEndsAt = (raw) => {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

/** Restore locked selection on mobile after refresh (Redis may store a number or JSON). */
const getMySubmittedOptionIndex = async (pin, questionId, teamId) => {
  if (!questionId || teamId == null) return null;
  try {
    const raw = await redisStore.getResponses(pin, questionId);
    const entry = raw[String(teamId)];
    if (entry === undefined || entry === null || entry === '') return null;
    const asNum = Number(entry);
    if (Number.isFinite(asNum) && asNum >= 0) return asNum;
    const parsed = JSON.parse(String(entry));
    if (Array.isArray(parsed?.selectedOptionIndex)) {
      return parsed.selectedOptionIndex.length > 0 ? parsed.selectedOptionIndex : null;
    }
    const idx = Number(parsed?.selectedOptionIndex);
    if (Number.isFinite(idx) && idx >= 0) return idx;
    return null;
  } catch {
    return null;
  }
};

/**
 * Resolve the locked wager for the current question (per-question lock).
 * Falls back to the legacy per-round bucket for sessions started before the per-question
 * refactor.
 */
const getLockedWager = (gameState, round, teamId, questionId) => {
  if (!gameState || !round) return null;
  const t = String(round.type || '').toUpperCase();
  if (t !== 'WAGER' && t !== 'FINAL_WAGER') return null;
  if (questionId != null) {
    const perQ = gameState.questionWagers?.[String(questionId)]?.[String(teamId)];
    if (perQ !== undefined && perQ !== null) {
      const parsed = Number(perQ);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  const legacy = gameState.roundWagers?.[String(round.id)]?.[String(teamId)];
  if (legacy === undefined || legacy === null) return null;
  const parsedLegacy = Number(legacy);
  return Number.isFinite(parsedLegacy) ? parsedLegacy : null;
};

/**
 * Builds the same `sessionPayload` object as `join_session` (SESSION_STATE body) from Redis + team.
 */
const buildSessionPayloadForPlayer = ({ pin, gameState, team, mySubmittedOptionIndex }) => {
  const currentRound = gameState?.rounds?.[gameState.currentRoundIndex];
  const currentQuestionRow = currentRound?.questions?.[gameState.currentQuestionIndex] || null;
  // Surface the upcoming question during WAGER_COLLECTION so the wager-input screen
  // anchors to the right question id (per-question wager lock).
  const currentQuestion =
    (gameState?.state === 'QUESTION' || gameState?.state === 'WAGER_COLLECTION') &&
    currentQuestionRow
      ? currentQuestionRow
      : null;

  const redisTeamRow = gameState?.teams?.[team.id] ?? gameState?.teams?.[String(team.id)] ?? null;
  const redisScoreRaw = redisTeamRow?.score;
  const resolvedJoinScore =
    redisScoreRaw !== undefined && redisScoreRaw !== null && Number.isFinite(Number(redisScoreRaw))
      ? Number(redisScoreRaw)
      : Number(team.score) || 0;

  return {
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
                  category: currentQuestion.category || null,
                },
                timerDuration:
                  Number(currentQuestion.timerDuration ?? currentRound?.timerDuration ?? 30) || 30,
                roundType: currentRound?.type || '',
                lockedWagerAmount: getLockedWager(
                  gameState,
                  currentRound,
                  team.id,
                  currentQuestion?.id,
                ),
                pointsForQuestion:
                  currentRound?.type === ROUND_TYPES.ELIMINATION
                    ? getEliminationPoints(gameState.currentQuestionIndex)
                    : undefined,
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
          miniGameConfig: gameState.miniGameConfig || null,
          scoreboardVisible: Boolean(gameState.scoreboardVisible),
          teams: gameState.teams,
          roundWagers: gameState.roundWagers || {},
          questionWagers: gameState.questionWagers || {},
          lockedWagerAmount: currentRound
            ? getLockedWager(gameState, currentRound, team.id, currentQuestion?.id)
            : null,
          ...(gameState.state === 'BREAK'
            ? {
                breakDuration: Math.max(0, Math.round(Number(gameState.breakDuration ?? 360))),
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
};

/**
 * Same ordered replay emits as `join_session` after SESSION_STATE (for HTTP + tests).
 * @returns {Promise<Array<{ event: string, data: object }>>}
 */
const buildJoinReplayEvents = async ({ pin, gameState, team, mySubmittedOptionIndex }) => {
  const events = [];
  if (!gameState || gameState.state === 'LOBBY') return events;

  const eliminatedTeamIdsForPayload = Object.values(gameState.teams || {})
    .filter((t) => t && t.isEliminated)
    .map((t) => Number(t.teamId))
    .filter((id) => Number.isFinite(id));

  const round = gameState.rounds?.[gameState.currentRoundIndex];
  const currentQuestionRow = round?.questions?.[gameState.currentQuestionIndex] || null;
  const currentQuestion =
    gameState.state === 'QUESTION' && currentQuestionRow ? currentQuestionRow : null;

  if (gameState.state === 'ROUND_INTRO' && round) {
    events.push({
      event: SOCKET_EVENTS.ROUND_INTRO,
      data: {
        round: { name: round.name, type: round.type },
        roundIndex: gameState.currentRoundIndex,
        totalRounds: gameState.rounds.length,
      },
    });
  }

  if (
    gameState.state === 'QUESTION' &&
    gameState.questionState === 'ACTIVE' &&
    round &&
    currentQuestion
  ) {
    events.push({
      event: SOCKET_EVENTS.QUESTION_ACTIVE,
      data: {
        questionIndex: gameState.currentQuestionIndex,
        totalQuestions: round.questions.length,
        question: {
          id: currentQuestion.id,
          text: currentQuestion.text,
          options: (currentQuestion.options || []).map((o) => ({ text: o.text })),
          mediaUrl: currentQuestion.mediaUrl,
          mediaType: currentQuestion.mediaType,
          category: currentQuestion.category || null,
        },
        timerDuration: Number(currentQuestion.timerDuration ?? round.timerDuration ?? 30) || 30,
        timerRemaining: timerManager.getReconnectTimerRemaining(pin, gameState),
        timerRunning: Boolean(gameState.timerRunning),
        timerEndsAt: safeClientTimerEndsAt(gameState.timerEndsAt),
        serverNow: Date.now(),
        roundType: round.type,
        lockedWagerAmount: getLockedWager(gameState, round, team.id, currentQuestion?.id),
        pointsForQuestion:
          round.type === ROUND_TYPES.ELIMINATION
            ? getEliminationPoints(gameState.currentQuestionIndex)
            : undefined,
        mySubmittedOptionIndex,
        eliminatedTeamIds: eliminatedTeamIdsForPayload,
      },
    });
    events.push({
      event: SOCKET_EVENTS.TIMER_UPDATE,
      data: {
        remaining: timerManager.getReconnectTimerRemaining(pin, gameState),
        timerRunning: Boolean(gameState.timerRunning),
        timerEndsAt: safeClientTimerEndsAt(gameState.timerEndsAt),
        serverNow: Date.now(),
      },
    });
  }

  if (gameState.state === 'QUESTION' && gameState.questionState === 'REVEALED') {
    const revealPayload = await buildRevealSnapshot(pin, gameState);
    if (revealPayload) {
      events.push({ event: SOCKET_EVENTS.ANSWER_REVEAL, data: revealPayload });
      events.push({ event: SOCKET_EVENTS.TIMER_UPDATE, data: { remaining: 0 } });
    }
  }

  if (gameState.state === 'SCOREBOARD') {
    const revealSnapshot = await buildRevealSnapshot(pin, gameState);
    events.push({
      event: SOCKET_EVENTS.SCOREBOARD,
      data: {
        teams: Object.values(gameState.teams).sort((a, b) => b.score - a.score),
        ...(revealSnapshot ? { revealSnapshot } : {}),
      },
    });
  }

  if (gameState.state === 'ROUND_END' && round) {
    const nextIdx = Number(gameState.currentRoundIndex) + 1;
    const nextRound =
      nextIdx >= 0 && nextIdx < gameState.rounds.length ? gameState.rounds[nextIdx] : null;
    events.push({
      event: SOCKET_EVENTS.ROUND_END,
      data: {
        roundIndex: gameState.currentRoundIndex,
        roundName: round.name || `Round ${Number(gameState.currentRoundIndex) + 1}`,
        roundType: round.type || '',
        nextRound: nextRound
          ? {
              index: nextIdx,
              name: nextRound.name || `Round ${nextIdx + 1}`,
              type: nextRound.type || '',
            }
          : null,
        isFinalRound: !nextRound,
      },
    });
  }

  if (gameState.scoreboardVisible && gameState.state !== 'SCOREBOARD') {
    const revealSnapshot = await buildRevealSnapshot(pin, gameState);
    events.push({
      event: SOCKET_EVENTS.SCOREBOARD,
      data: {
        teams: Object.values(gameState.teams).sort((a, b) => b.score - a.score),
        source: 'manual',
        ...(revealSnapshot ? { revealSnapshot } : {}),
      },
    });
  }

  if (gameState.state === 'BREAK') {
    const bd = Math.max(0, Math.round(Number(gameState.breakDuration ?? 360)));
    const br = getBreakRemainingSeconds(gameState);
    const serverNow = Date.now();
    events.push({
      event: SOCKET_EVENTS.BREAK_START,
      data: {
        duration: br,
        breakDuration: bd,
        breakRemaining: br,
        breakEndsAt:
          Number.isFinite(Number(gameState.breakEndsAt)) && Number(gameState.breakEndsAt) > 0
            ? Number(gameState.breakEndsAt)
            : undefined,
        serverNow,
        currentRoundIndex: Number(gameState.currentRoundIndex ?? 0),
        upNextRound: getBreakUpNextRoundPayload(gameState),
      },
    });
  }

  if (gameState.activeMiniGame) {
    const mgsJoin = gameState.miniGameState;
    const kangarooPickPhase = mgsJoin?.game === 'kangaroo_race' && !mgsJoin?.revealed;
    const cardPickPhase =
      mgsJoin?.game === 'card_shuffle' &&
      mgsJoin?.gameStarted &&
      !mgsJoin?.revealed &&
      mgsJoin?.activeRound != null;

    events.push({
      event: SOCKET_EVENTS.MINI_GAME_START,
      data: {
        game: gameState.activeMiniGame,
        ...(gameState.miniGameConfig || {}),
        ...(kangarooPickPhase || cardPickPhase ? { rejoinReplay: true } : {}),
      },
    });

    if (gameState.miniGameState?.game === 'card_shuffle' && gameState.miniGameState?.revealed) {
      events.push({
        event: SOCKET_EVENTS.MINI_GAME_REVEAL,
        data: {
          game: 'card_shuffle',
          correctPosition: Number(gameState.miniGameState.correctPosition),
          roundNumber: gameState.miniGameState.activeRound || undefined,
          cardPositions: Array.isArray(gameState.miniGameState.cardPositions)
            ? gameState.miniGameState.cardPositions
            : [],
        },
      });
      const selectedChoiceRaw = gameState.miniGameState.selections?.[String(team.id)];
      const selectedChoice = Number.isFinite(Number(selectedChoiceRaw))
        ? Number(selectedChoiceRaw)
        : null;
      const correctPosition = Number(gameState.miniGameState.correctPosition);
      events.push({
        event: SOCKET_EVENTS.MINI_GAME_PLAYER_RESULT,
        data: {
          game: 'card_shuffle',
          result: selectedChoice === correctPosition ? 'winner' : 'loser',
          correctPosition,
          selectedChoice,
          roundNumber: gameState.miniGameState.activeRound || undefined,
        },
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
      events.push({
        event: SOCKET_EVENTS.MINI_GAME_REVEAL,
        data: {
          game: 'kangaroo_race',
          winningKangaroo,
          finishOrder,
          kangarooNames,
          pointsByRank: [50, 40, 30, 20, 10, 0],
        },
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
      events.push({
        event: SOCKET_EVENTS.MINI_GAME_PLAYER_RESULT,
        data: {
          game: 'kangaroo_race',
          result: pointsEarned === pointsByRank[0] ? 'winner' : 'loser',
          winningKangaroo,
          finishOrder,
          selectedChoice,
          finishRank: finishRank || null,
          pointsEarned,
          kangarooNames,
        },
      });
    }
  }

  if (gameState.state === 'FINAL_RESULTS') {
    events.push({
      event: SOCKET_EVENTS.GAME_END,
      data: {
        teams: Object.values(gameState.teams).sort((a, b) => b.score - a.score),
      },
    });
  }

  return events;
};

const emitJoinReplaysToSocket = (socket, events) => {
  for (const { event, data } of events) {
    socket.emit(event, data);
  }
};

/**
 * Read-only restore bundle for HTTP (no socket join, no Redis mutation).
 */
const buildPlayerHttpRestore = async (pin, teamId) => {
  const hostReadySession = await sessionService.getPlayerJoinEligibleSessionByPin(pin);
  if (!hostReadySession) {
    return {
      ok: false,
      status: 404,
      message: 'Session not found, not active, or no host is assigned to this PIN yet.',
      code: 'NO_ASSIGNED_HOST',
    };
  }

  const team = await Team.findOne({
    where: { id: teamId, sessionId: hostReadySession.id },
    attributes: ['id', 'teamName', 'score', 'isEliminated'],
  });
  if (!team) {
    return { ok: false, status: 404, message: 'Team not found for this session' };
  }

  let gameState = await redisStore.getGameState(pin);
  const normalizedTeamName = normalizeTeamName(team.teamName);
  const wasRemovedByHost =
    Array.isArray(gameState?.removedTeamNames) &&
    gameState.removedTeamNames.map((name) => normalizeTeamName(name)).includes(normalizedTeamName);
  if (wasRemovedByHost) {
    return {
      ok: false,
      status: 403,
      message: 'You have been removed from this game by the host.',
      code: 'TEAM_REMOVED',
    };
  }

  if (gameState) {
    const refreshed = await redisStore.getGameState(pin);
    if (refreshed) gameState = refreshed;
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
    mySubmittedOptionIndex = await getMySubmittedOptionIndex(pin, questionForSubmitted.id, team.id);
  }

  const sessionPayload = buildSessionPayloadForPlayer({
    pin,
    gameState,
    team,
    mySubmittedOptionIndex,
  });

  const replays = gameState
    ? await buildJoinReplayEvents({ pin, gameState, team, mySubmittedOptionIndex })
    : [];

  return { ok: true, sessionPayload, replays };
};

module.exports = {
  safeClientTimerEndsAt,
  getMySubmittedOptionIndex,
  getLockedWager,
  buildSessionPayloadForPlayer,
  buildJoinReplayEvents,
  emitJoinReplaysToSocket,
  buildPlayerHttpRestore,
};
