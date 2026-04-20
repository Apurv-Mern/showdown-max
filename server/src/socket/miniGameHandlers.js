const { SOCKET_EVENTS } = require('shared/constants/socketEvents');
const logger = require('../utils/logger');
const gameController = require('../services/game-engine/gameController');
const redisStore = require('../services/redisSessionStore');

const createCardShuffleRoundState = (roundNumber = null, gameStarted = true) => ({
  game: 'card_shuffle',
  ready: false,
  gameStarted,
  activeRound: roundNumber,
  revealed: false,
  correctPosition: null,
  cardPositions: [],
  selections: {},
  pickCounts: { 1: 0, 2: 0, 3: 0 },
});

const createHorseRaceRoundState = (gameStarted = false, winningKangaroo = null) => ({
  game: 'kangaroo_race',
  ready: false,
  gameStarted,
  revealed: false,
  winningKangaroo,
  selections: {},
  pickCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
});

const normalizeMiniGameId = (game) =>
  game == null || game === '' ? '' : String(game).toLowerCase().replace(/-/g, '_');

const normalizeRevealSlotOneToSix = (n) => {
  if (!Number.isFinite(n)) return NaN;
  const t = Math.trunc(Number(n));
  if (t >= 1 && t <= 6) return t;
  if (t >= 0 && t <= 5) return t + 1;
  return NaN;
};

const KANGAROO_NAME_TO_SLOT = Object.freeze({
  blue: 1,
  orange: 2,
  green: 3,
  yellow: 4,
  purple: 5,
  red: 6,
});

const readWinningKangaroo = (obj) => {
  if (!obj || typeof obj !== 'object') return NaN;

  const rawIndex =
    obj.winner_index ??
    obj.winnerIndex ??
    obj.winning_index ??
    obj.winningIndex ??
    obj.winningKangaroo ??
    obj.kangaroo_index ??
    obj.kangarooIndex ??
    obj.results?.winner_index ??
    obj.results?.winnerIndex ??
    obj.results?.winningKangaroo;

  const byIndex = normalizeRevealSlotOneToSix(Number(rawIndex));
  if (Number.isFinite(byIndex)) return byIndex;

  const rawName = obj.winner_name ?? obj.winnerName ?? obj.winner ?? obj.results?.winner_name;
  if (typeof rawName === 'string') {
    const byName = KANGAROO_NAME_TO_SLOT[rawName.trim().toLowerCase()];
    if (Number.isFinite(byName)) return byName;
  }

  return NaN;
};

/** Unwrap JSON strings (Unity sometimes double-encodes `payload`). */
const normalizeUnityPayload = (value, depth = 0) => {
  if (depth > 10) return {};
  if (value === null || value === undefined) return {};
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return normalizeUnityPayload(parsed, depth + 1);
      if (parsed && typeof parsed === 'object') return parsed;
      return {};
    } catch {
      return {};
    }
  }
  if (typeof value === 'object') return value;
  return {};
};

/** Raw number from Unity payload (may be 0-based 0–2 or 1-based 1–3). */
const readCorrectPosition = (obj) => {
  if (!obj || typeof obj !== 'object') return NaN;
  const raw =
    obj.correct_position ??
    obj.correctPosition ??
    obj.correctIndex ??
    obj.winningPosition ??
    obj.winning_slot ??
    obj.queenPosition ??
    obj.slot ??
    obj.results?.correct_position ??
    obj.results?.correctPosition;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
};

/** Player picks and API use slots 1 = Left, 2 = Middle, 3 = Right. */
const normalizeRevealSlotOneToThree = (n) => {
  if (!Number.isFinite(n)) return NaN;
  const t = Math.trunc(Number(n));
  // Unity always sends 0-based: 0=Left, 1=Middle, 2=Right → convert to 1-based.
  // This check must come FIRST so values 1 & 2 are treated as 0-indexed (not
  // passed through as 1-indexed Middle/Right).
  if (t >= 0 && t <= 2) return t + 1; // 0→1(L), 1→2(M), 2→3(R)
  if (t === 3) return t; // already 1-based Right (unambiguous)
  return NaN;
};

const readCardPositionsArray = (obj) => {
  if (!obj || typeof obj !== 'object') return [];
  const arr = obj.card_positions ?? obj.cardPositions;
  return Array.isArray(arr) ? arr.map((value) => Number(value)) : [];
};

const extractCardShuffleReveal = (data = {}) => {
  const directValue = normalizeUnityPayload(data.value);
  const directPayload = normalizeUnityPayload(directValue.payload);

  if (String(directValue.type || '').toUpperCase() === 'SHUFFLE_COMPLETE') {
    const pPayload = readCorrectPosition(directPayload);
    const pRoot = readCorrectPosition(directValue);
    const raw = Number.isFinite(pPayload) ? pPayload : pRoot;
    const correctPosition = normalizeRevealSlotOneToThree(raw);
    const fromPayload = readCardPositionsArray(directPayload);
    const fromValue = readCardPositionsArray(directValue);
    return {
      correctPosition,
      cardPositions: fromPayload.length ? fromPayload : fromValue,
    };
  }

  if (String(data.action || '').toUpperCase() === 'SHUFFLE_COMPLETE') {
    const correctPosition = normalizeRevealSlotOneToThree(readCorrectPosition(directValue));
    return {
      correctPosition,
      cardPositions: readCardPositionsArray(directValue),
    };
  }

  const fromRoot = normalizeRevealSlotOneToThree(readCorrectPosition(directValue));
  if (Number.isFinite(fromRoot)) {
    return {
      correctPosition: fromRoot,
      cardPositions: readCardPositionsArray(directValue),
    };
  }

  /** Whole `value` may be the inner payload only (no `type` on object). */
  const fromBare = normalizeRevealSlotOneToThree(readCorrectPosition(directPayload));
  if (Number.isFinite(fromBare)) {
    return {
      correctPosition: fromBare,
      cardPositions: readCardPositionsArray(directPayload).length
        ? readCardPositionsArray(directPayload)
        : readCardPositionsArray(directValue),
    };
  }

  return null;
};

const hydrateCardShuffleState = async (pin, updater) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState) {
    console.warn('[miniGameHandlers] hydrateCardShuffleState: no gameState found for pin', pin);
    return null;
  }

  // If activeMiniGame is not set (e.g. server restarted and lost in-memory state),
  // bootstrap it rather than silently dropping the SHUFFLE_COMPLETE result.
  if (gameState.activeMiniGame !== 'card_shuffle') {
    console.warn(
      '[miniGameHandlers] hydrateCardShuffleState: activeMiniGame is',
      gameState.activeMiniGame,
      '— bootstrapping card_shuffle state for pin',
      pin,
    );
    gameState.activeMiniGame = 'card_shuffle';
  }

  const baseState =
    gameState.miniGameState?.game === 'card_shuffle'
      ? gameState.miniGameState
      : createCardShuffleRoundState();

  gameState.miniGameState = updater({
    ...baseState,
    selections: { ...(baseState.selections || {}) },
  });
  await redisStore.setGameState(pin, gameState);
  return gameState;
};

const hydrateHorseRaceState = async (pin, updater) => {
  const gameState = await redisStore.getGameState(pin);
  if (!gameState) {
    console.warn('[miniGameHandlers] hydrateHorseRaceState: no gameState found for pin', pin);
    return null;
  }

  if (gameState.activeMiniGame !== 'kangaroo_race') {
    console.warn(
      '[miniGameHandlers] hydrateHorseRaceState: activeMiniGame is',
      gameState.activeMiniGame,
      '— bootstrapping kangaroo_race state for pin',
      pin,
    );
    gameState.activeMiniGame = 'kangaroo_race';
  }

  const baseState =
    gameState.miniGameState?.game === 'kangaroo_race'
      ? gameState.miniGameState
      : createHorseRaceRoundState(false, Number(gameState.miniGameConfig?.winningKangaroo) || null);

  gameState.miniGameState = updater({
    ...baseState,
    selections: { ...(baseState.selections || {}) },
  });
  await redisStore.setGameState(pin, gameState);
  return gameState;
};

const emitCardShufflePlayerResults = async (io, pin, miniGameState) => {
  if (!pin || !miniGameState || miniGameState.game !== 'card_shuffle') return;

  const correctPosition = Number(miniGameState.correctPosition);
  if (!Number.isFinite(correctPosition) || correctPosition < 1 || correctPosition > 3) return;

  const room = `session:${pin}`;
  const socketsInRoom = await io.in(room).fetchSockets();

  for (const roomSocket of socketsInRoom) {
    const teamId = Number(roomSocket.data?.teamId);
    if (!Number.isFinite(teamId) || teamId <= 0) continue;

    const rawChoice = miniGameState.selections?.[String(teamId)];
    const selectedChoice = Number.isFinite(Number(rawChoice)) ? Number(rawChoice) : null;

    roomSocket.emit(SOCKET_EVENTS.MINI_GAME_PLAYER_RESULT, {
      game: 'card_shuffle',
      result: selectedChoice === correctPosition ? 'winner' : 'loser',
      correctPosition,
      selectedChoice,
      roundNumber: miniGameState.activeRound || undefined,
    });
  }
};

const emitHorseRacePlayerResults = async (io, pin, miniGameState) => {
  if (!pin || !miniGameState || miniGameState.game !== 'kangaroo_race') return;

  const winningKangaroo = Number(miniGameState.winningKangaroo);
  if (!Number.isFinite(winningKangaroo) || winningKangaroo < 1 || winningKangaroo > 6) return;

  const room = `session:${pin}`;
  const socketsInRoom = await io.in(room).fetchSockets();

  for (const roomSocket of socketsInRoom) {
    const teamId = Number(roomSocket.data?.teamId);
    if (!Number.isFinite(teamId) || teamId <= 0) continue;

    const rawChoice = miniGameState.selections?.[String(teamId)];
    const selectedChoice = Number.isFinite(Number(rawChoice)) ? Number(rawChoice) : null;

    roomSocket.emit(SOCKET_EVENTS.MINI_GAME_PLAYER_RESULT, {
      game: 'kangaroo_race',
      result: selectedChoice === winningKangaroo ? 'winner' : 'loser',
      winningKangaroo,
      selectedChoice,
    });
  }
};

/**
 * Registers mini-game socket event handlers.
 *
 * Flow:
 *  1. Host emits LAUNCH_MINI_GAME -> gameController broadcasts MINI_GAME_START
 *  2. Venue emits MINI_GAME_READY -> relayed to host + venue in the same session room
 *  3. Host emits MINI_GAME_COMMAND -> relayed to venue in the same session room
 *  4. Players emit MINI_GAME_ACTION (choice) -> relayed to venue + host and persisted for Card Shuffle
 *  5. Unity (venue) emits MINI_GAME_ACTION(source:'unity', action:'game_complete') -> broadcast MINI_GAME_REVEAL
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
const miniGameHandlers = (io, socket) => {
  socket.on(SOCKET_EVENTS.MINI_GAME_READY, async (data = {}) => {
    try {
      const pin = data.pin || socket.data?.pin;
      if (!pin) return;

      const payload = {
        game: data.game,
        ready: data.ready !== false,
        source: socket.data?.role || data.source || 'venue',
      };

      if (payload.game === 'card_shuffle') {
        await hydrateCardShuffleState(pin, (state) => ({
          ...state,
          ready: payload.ready,
        }));
      }

      io.to(`session:${pin}`).emit(SOCKET_EVENTS.MINI_GAME_READY, payload);
      logger.debug('Mini-game readiness relayed', {
        pin,
        game: payload.game,
        ready: payload.ready,
      });
    } catch (err) {
      logger.error('mini_game_ready error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.MINI_GAME_COMMAND, async (data = {}) => {
    try {
      const pin = data.pin || socket.data?.pin;
      if (!pin) return;

      const payload = {
        game: data.game,
        command: data.command,
        roundNumber: data.roundNumber,
        source: socket.data?.role || data.source || 'host',
      };

      /** Snapshot for mobile/venue when host triggers reveal (before state is cleared). */
      let cardShuffleReveal = null;

      if (payload.game === 'card_shuffle') {
        if (payload.command === 'start_game') {
          const gs = await redisStore.getGameState(pin);
          if (gs?.miniGameState?.game === 'card_shuffle' && gs.miniGameState.gameStarted) {
            logger.warn('Duplicate card_shuffle start_game ignored', { pin });
            return;
          }
        }

        /** Full miniGameState from Redis at reveal time — includes player selections. */
        let capturedMiniGameState = null;

        if (payload.command === 'reveal_cards') {
          const gsReveal = await redisStore.getGameState(pin);
          const s = gsReveal?.miniGameState;
          if (s?.game === 'card_shuffle') {
            const cp = Number(s.correctPosition);
            const hasPos = Number.isFinite(cp) && cp >= 1 && cp <= 3;
            const rnRaw = payload.roundNumber ?? s.activeRound;
            const rn = Number(rnRaw);
            const roundNumber = Number.isFinite(rn) && rn >= 1 && rn <= 4 ? rn : undefined;
            const cardPositions = Array.isArray(s.cardPositions)
              ? s.cardPositions.map((v) => Number(v)).filter((n) => Number.isFinite(n))
              : [];
            cardShuffleReveal = {
              game: 'card_shuffle',
              ...(hasPos ? { correctPosition: cp, correct_position: cp } : {}),
              ...(roundNumber !== undefined ? { roundNumber } : {}),
              cardPositions,
            };
            // Capture the full state (with selections) for use in emitCardShufflePlayerResults.
            capturedMiniGameState = s;
            logger.info('Card Shuffle host reveal command (snapshot before Unity clear)', {
              pin,
              roundNumber,
              hasWinningSlot: hasPos,
              cardPositionsCount: cardPositions.length,
            });
          }
        }

        await hydrateCardShuffleState(pin, (state) => {
          if (payload.command === 'start_game') {
            return {
              ...createCardShuffleRoundState(1, true),
              ready: state.ready,
            };
          }

          if (payload.command === 'next_round') {
            return {
              ...createCardShuffleRoundState(payload.roundNumber || null, true),
              ready: state.ready,
            };
          }

          if (payload.command === 'reveal_cards') {
            // Mark as revealed but KEEP correctPosition + cardPositions
            // so mini_game_rejoin can replay the result for late-joiners.
            return {
              ...state,
              revealed: true,
            };
          }

          return state;
        });
      }

      if (payload.game === 'kangaroo_race') {
        let horseRaceReveal = null;
        let capturedMiniGameState = null;

        if (payload.command === 'start_game') {
          await hydrateHorseRaceState(pin, (state) => ({
            ...state,
            gameStarted: true,
            revealed: false,
            winningKangaroo:
              Number(state.winningKangaroo) ||
              Number(data.winningKangaroo) ||
              Number(data.config?.winningKangaroo) ||
              null,
            selections: {},
            pickCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
          }));
        }

        if (payload.command === 'reveal_winner') {
          const gsReveal = await redisStore.getGameState(pin);
          const s = gsReveal?.miniGameState;
          if (s?.game === 'kangaroo_race') {
            const winnerRaw =
              Number(data.winningKangaroo) ||
              Number(s.winningKangaroo) ||
              Number(gsReveal?.miniGameConfig?.winningKangaroo);
            const winner = Number.isFinite(winnerRaw) ? Math.trunc(winnerRaw) : NaN;
            const hasWinner = winner >= 1 && winner <= 6;
            if (hasWinner) {
              horseRaceReveal = {
                game: 'kangaroo_race',
                winningKangaroo: winner,
              };
              capturedMiniGameState = s;
            }
          }

          await hydrateHorseRaceState(pin, (state) => ({
            ...state,
            revealed: true,
            winningKangaroo:
              Number(data.winningKangaroo) ||
              Number(state.winningKangaroo) ||
              Number(gsReveal?.miniGameConfig?.winningKangaroo) ||
              null,
          }));
        }

        const horseCommandOut = horseRaceReveal != null ? { ...payload, horseRaceReveal } : payload;
        io.to(`session:${pin}`).emit(SOCKET_EVENTS.MINI_GAME_COMMAND, horseCommandOut);

        if (horseRaceReveal?.winningKangaroo) {
          const winner = Number(horseRaceReveal.winningKangaroo);
          io.to(`session:${pin}`).emit(SOCKET_EVENTS.MINI_GAME_REVEAL, {
            game: 'kangaroo_race',
            winningKangaroo: winner,
          });

          const revealMgs = {
            ...(capturedMiniGameState || {}),
            winningKangaroo: winner,
            revealed: true,
          };
          await emitHorseRacePlayerResults(io, pin, revealMgs);
        }

        logger.info('Horse race command relayed', {
          pin,
          command: payload.command,
          winningKangaroo: Number(data.winningKangaroo) || undefined,
        });
        return;
      }

      const commandOut = cardShuffleReveal != null ? { ...payload, cardShuffleReveal } : payload;
      io.to(`session:${pin}`).emit(SOCKET_EVENTS.MINI_GAME_COMMAND, commandOut);

      // ── Host triggered reveal: now broadcast result to all players ──
      if (
        payload.game === 'card_shuffle' &&
        payload.command === 'reveal_cards' &&
        cardShuffleReveal?.correctPosition
      ) {
        const revealRoom = `session:${pin}`;
        const cp = Number(cardShuffleReveal.correctPosition);
        console.log(
          '[miniGameHandlers] Host reveal_cards — broadcasting mini_game_reveal to room',
          { pin, correctPosition: cp },
        );
        io.to(revealRoom).emit(SOCKET_EVENTS.MINI_GAME_REVEAL, {
          game: 'card_shuffle',
          correctPosition: cp,
          roundNumber: cardShuffleReveal.roundNumber,
          cardPositions: cardShuffleReveal.cardPositions,
        });
        // Merge captured state (has player selections) with the reveal correctPosition.
        // Without selections, every player would get selectedChoice:null and always score as loser.
        const revealMgs = {
          ...(capturedMiniGameState || {}),
          correctPosition: cp,
          revealed: true,
        };
        console.log('[miniGameHandlers] emitCardShufflePlayerResults with selections:', {
          selectionsKeys: Object.keys(revealMgs.selections || {}),
          correctPosition: cp,
        });
        await emitCardShufflePlayerResults(io, pin, revealMgs);
        logger.info('Host triggered reveal — result sent to players', { pin, correctPosition: cp });
      }

      logger.info('Mini-game command relayed', {
        pin,
        game: commandOut.game,
        command: commandOut.command,
        roundNumber: commandOut.roundNumber,
        ...(commandOut.cardShuffleReveal
          ? { cardShuffleReveal: commandOut.cardShuffleReveal }
          : {}),
      });
    } catch (err) {
      logger.error('mini_game_command error', { error: err.message });
    }
  });

  socket.on(SOCKET_EVENTS.MINI_GAME_ACTION, async (data = {}) => {
    try {
      const { pin, teamId } = socket.data || {};
      const eventPin = pin || data.pin;
      if (!eventPin) return;

      const room = `session:${eventPin}`;

      if (data.source === 'unity') {
        const directValue = normalizeUnityPayload(data.value);
        const directPayload = normalizeUnityPayload(directValue.payload);
        const actionUpper = String(data.action || '').toUpperCase();
        const valueTypeUpper = String(directValue.type || '').toUpperCase();

        const currentGameState = await redisStore.getGameState(eventPin);
        const activeGame = normalizeMiniGameId(
          currentGameState?.miniGameState?.game ||
            currentGameState?.activeMiniGame ||
            data.game ||
            directValue.game,
        );

        if (activeGame === 'kangaroo_race') {
          const winnerCandidates = [
            readWinningKangaroo(directPayload),
            readWinningKangaroo(directValue),
            readWinningKangaroo(data),
            normalizeRevealSlotOneToSix(Number(data.winningKangaroo)),
          ];
          const winningKangaroo = winnerCandidates.find((n) => Number.isFinite(n));

          const isResultSignal =
            actionUpper === 'ROUND_RESULT' ||
            actionUpper === 'ROUND_COMPLETE' ||
            actionUpper === 'GAME_COMPLETE' ||
            actionUpper === 'MINIGAME_REVEAL' ||
            actionUpper === 'GAME_FINISHED' ||
            valueTypeUpper === 'ROUND_RESULT' ||
            valueTypeUpper === 'ROUND_COMPLETE' ||
            valueTypeUpper === 'GAME_COMPLETE' ||
            valueTypeUpper === 'GAME_FINISHED' ||
            data.action === 'game_complete';

          if (isResultSignal && Number.isFinite(winningKangaroo)) {
            const winner = Number(winningKangaroo);
            const gameState = await hydrateHorseRaceState(eventPin, (state) => ({
              ...state,
              gameStarted: true,
              revealed: true,
              winningKangaroo: winner,
            }));

            io.to(room).emit(SOCKET_EVENTS.MINI_GAME_REVEAL, {
              game: 'kangaroo_race',
              winningKangaroo: winner,
            });

            const revealMgs = {
              ...(gameState?.miniGameState || {}),
              game: 'kangaroo_race',
              revealed: true,
              winningKangaroo: winner,
            };
            await emitHorseRacePlayerResults(io, eventPin, revealMgs);

            logger.info('Kangaroo race result from Unity relayed to players', {
              pin: eventPin,
              action: data.action,
              resultType: valueTypeUpper || undefined,
              winningKangaroo: winner,
            });
            return;
          }

          if (data.action === 'game_complete' || actionUpper === 'GAME_COMPLETE') {
            logger.warn('Kangaroo game_complete from Unity without winner payload', {
              pin: eventPin,
              action: data.action,
              resultType: valueTypeUpper || undefined,
            });
            return;
          }
        }

        let reveal = extractCardShuffleReveal(data);
        if (!reveal && data.value != null) {
          const v = directValue;
          if (
            v &&
            typeof v === 'object' &&
            String(v.type || '').toUpperCase() === 'SHUFFLE_COMPLETE'
          ) {
            reveal = extractCardShuffleReveal({ ...data, action: 'SHUFFLE_COMPLETE', value: v });
          }
        }

        if (reveal) {
          const { correctPosition, cardPositions } = reveal;

          // ── Server debug: log raw values from Unity SHUFFLE_COMPLETE ──
          console.log('[miniGameHandlers] SHUFFLE_COMPLETE received from Unity →', {
            pin: eventPin,
            correctPosition,
            cardPositions,
            rawAction: data.action,
          });

          if (!Number.isFinite(correctPosition) || correctPosition < 1 || correctPosition > 3) {
            logger.warn('Card Shuffle reveal missing or invalid correct_position', {
              pin: eventPin,
              raw: reveal.correctPosition,
              data,
            });
            return;
          }

          // Store position in Redis but do NOT reveal to players yet.
          // The host will trigger the reveal by tapping "reveal_cards".
          const gameState = await hydrateCardShuffleState(eventPin, (state) => ({
            ...state,
            revealed: false,
            correctPosition,
            cardPositions,
          }));

          // Notify all clients that the shuffle animation is done so mobile
          // knows cards have stopped and the round is still open for picking.
          io.to(room).emit(SOCKET_EVENTS.MINI_GAME_UPDATE, {
            game: 'card_shuffle',
            source: 'unity',
            action: 'SHUFFLE_COMPLETE',
            value: {
              type: 'SHUFFLE_COMPLETE',
              payload: {
                correct_position: correctPosition,
                card_positions: cardPositions,
              },
            },
          });

          logger.info('Card Shuffle SHUFFLE_COMPLETE stored — waiting for host reveal', {
            pin: eventPin,
            correctPosition,
            cardPositions,
            roundNumber: gameState?.miniGameState?.activeRound || undefined,
          });
          // Do NOT emit mini_game_reveal or call emitCardShufflePlayerResults here.
          // That happens when the host taps reveal_cards.
          return;
        }

        if (String(data.action || '') === 'ROUND_COMPLETE') {
          // Round complete — host controls reveal, nothing to broadcast here.
          logger.debug(
            'Card Shuffle ROUND_COMPLETE from Unity — no auto-reveal (host controls it)',
            { pin: eventPin },
          );
          return;
        }

        if (data.action === 'game_complete') {
          const result = typeof data.value === 'object' && data.value ? data.value : {};
          const resultType = String(result.type || '');
          if (resultType === 'ROUND_COMPLETE') {
            logger.debug('Card Shuffle round complete received from Unity', { pin: eventPin });
            return;
          }
          await gameController.endMiniGame(io, eventPin);
          logger.info('Mini-game completed via Unity', { pin: eventPin, resultType });
          return;
        }
      }

      let shouldRelayPlayerSelection = true;

      if (
        socket.data?.role !== 'venue' &&
        data.action === 'select' &&
        Number.isFinite(Number(data.value))
      ) {
        const current = await redisStore.getGameState(eventPin);
        const activeGame = current?.miniGameState?.game;

        if (activeGame === 'kangaroo_race') {
          await hydrateHorseRaceState(eventPin, (state) => {
            if (state.game !== 'kangaroo_race' || state.revealed || !state.gameStarted || !teamId) {
              shouldRelayPlayerSelection = false;
              return state;
            }

            const choice = Number(data.value);
            if (choice < 1 || choice > 6) {
              shouldRelayPlayerSelection = false;
              return state;
            }
            if (state.selections[String(teamId)] !== undefined) {
              shouldRelayPlayerSelection = false;
              return state;
            }

            const selections = { ...(state.selections || {}), [String(teamId)]: choice };
            const pickCounts = { ...(state.pickCounts || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }) };
            pickCounts[choice] = Number(pickCounts[choice] || 0) + 1;

            return {
              ...state,
              selections,
              pickCounts,
            };
          });
        } else {
          await hydrateCardShuffleState(eventPin, (state) => {
            if (state.game !== 'card_shuffle' || state.revealed || !state.gameStarted || !teamId) {
              shouldRelayPlayerSelection = false;
              return state;
            }

            const choice = Number(data.value);
            if (choice < 1 || choice > 3) {
              shouldRelayPlayerSelection = false;
              return state;
            }
            if (state.selections[String(teamId)] !== undefined) {
              shouldRelayPlayerSelection = false;
              return state;
            }

            const selections = { ...(state.selections || {}), [String(teamId)]: choice };
            const pickCounts = { ...(state.pickCounts || { 1: 0, 2: 0, 3: 0 }) };
            pickCounts[choice] = Number(pickCounts[choice] || 0) + 1;

            return {
              ...state,
              selections,
              pickCounts,
            };
          });
        }
      }

      if (data.action === 'select' && !shouldRelayPlayerSelection) {
        return;
      }

      // For MINIGAME_REVEAL from Unity, attach stored correctPosition so
      // mobile players that missed the first SHUFFLE_COMPLETE relay can still
      // show the winner/loser result.
      let extraRevealFields = {};
      const actionUpper = String(data.action || '').toUpperCase();
      if (data.source === 'unity' && actionUpper === 'MINIGAME_REVEAL') {
        const freshState = await redisStore.getGameState(eventPin);
        const mgs = freshState?.miniGameState;
        if (mgs?.game === 'card_shuffle' && Number.isFinite(Number(mgs.correctPosition))) {
          extraRevealFields = {
            correctPosition: Number(mgs.correctPosition),
            cardPositions: Array.isArray(mgs.cardPositions) ? mgs.cardPositions : [],
          };
          logger.info('MINIGAME_REVEAL — attaching correctPosition to update', {
            pin: eventPin,
            correctPosition: extraRevealFields.correctPosition,
          });
        }
      }

      io.to(room).emit(SOCKET_EVENTS.MINI_GAME_UPDATE, {
        teamId,
        teamName: socket.data?.teamName,
        action: data.action,
        value: data.value,
        source: data.source || 'player',
        ...extraRevealFields,
      });

      logger.debug('Mini-game action relayed', {
        pin: eventPin,
        teamId,
        action: data.action,
        value: data.value,
      });
    } catch (err) {
      logger.error('mini_game_action error', { error: err.message });
    }
  }); // end socket.on(MINI_GAME_ACTION)

  /**
   * Lightweight rejoin used by the mobile mini-game page after a socket
   * reconnect (e.g. HMR / Fast Refresh).  Skips the full join_session
   * name-collision check so it works even while the old socket is still
   * alive for a brief moment.  Requires {pin, teamId, teamName}.
   */
  socket.on('mini_game_rejoin', async (data = {}) => {
    try {
      const { pin, teamId, teamName } = data;
      if (!pin || !teamId) {
        logger.warn('mini_game_rejoin: missing pin or teamId', { pin, teamId });
        return;
      }

      // Re‑room the socket and stamp socket.data so subsequent handlers work.
      socket.join(`session:${pin}`);
      socket.data = {
        ...socket.data,
        pin,
        teamId: Number(teamId),
        teamName: teamName || socket.data?.teamName,
      };

      logger.info('mini_game_rejoin: socket re‑joined room', { pin, teamId, socketId: socket.id });

      // Replay the current mini-game state so the player sees winner/loser
      // even if mini_game_reveal fired before the rejoin completed.
      const gameState = await redisStore.getGameState(pin);
      const mgs = gameState?.miniGameState;
      if (
        mgs?.game === 'card_shuffle' &&
        mgs.revealed &&
        Number.isFinite(Number(mgs.correctPosition))
      ) {
        const correctPosition = Number(mgs.correctPosition);
        socket.emit(SOCKET_EVENTS.MINI_GAME_REVEAL, {
          game: 'card_shuffle',
          correctPosition,
          roundNumber: mgs.activeRound || undefined,
          cardPositions: Array.isArray(mgs.cardPositions) ? mgs.cardPositions : [],
        });

        const selectedChoiceRaw = mgs.selections?.[String(teamId)];
        const selectedChoice = Number.isFinite(Number(selectedChoiceRaw))
          ? Number(selectedChoiceRaw)
          : null;
        socket.emit(SOCKET_EVENTS.MINI_GAME_PLAYER_RESULT, {
          game: 'card_shuffle',
          result: selectedChoice === correctPosition ? 'winner' : 'loser',
          correctPosition,
          selectedChoice,
          roundNumber: mgs.activeRound || undefined,
        });
      }

      if (
        mgs?.game === 'kangaroo_race' &&
        mgs.revealed &&
        Number.isFinite(Number(mgs.winningKangaroo))
      ) {
        const winningKangaroo = Number(mgs.winningKangaroo);
        socket.emit(SOCKET_EVENTS.MINI_GAME_REVEAL, {
          game: 'kangaroo_race',
          winningKangaroo,
        });

        const selectedChoiceRaw = mgs.selections?.[String(teamId)];
        const selectedChoice = Number.isFinite(Number(selectedChoiceRaw))
          ? Number(selectedChoiceRaw)
          : null;
        socket.emit(SOCKET_EVENTS.MINI_GAME_PLAYER_RESULT, {
          game: 'kangaroo_race',
          result: selectedChoice === winningKangaroo ? 'winner' : 'loser',
          winningKangaroo,
          selectedChoice,
        });
      }
    } catch (err) {
      logger.error('mini_game_rejoin error', { error: err.message });
    }
  });
};

module.exports = miniGameHandlers;
