# Max Showdown Trivia — Game Flow, Sockets & Data Deep-Dive

## 1. System Overview

A real-time live trivia platform for venues (bars, events), supporting 300+ concurrent players. The system has **four interfaces** that all connect to a single Fastify server (`:5001`) via REST and/or WebSocket:

```mermaid
graph LR
    A["Admin Panel<br/>/admin/*"] -->|REST API| S["Fastify Server :5001"]
    H["Host Control<br/>/host/*"] -->|REST + WebSocket| S
    P["Player Mobile<br/>/play/*"] -->|WebSocket only| S
    V["Venue Display<br/>/venue/*"] -->|WebSocket only| S
    S --> DB["MySQL<br/>(Sequelize)"]
    S --> R["Redis / In-Memory<br/>(Live State)"]
```

| Interface | Auth | Protocol | Purpose |
|-----------|------|----------|---------|
| **Admin Panel** | JWT (admin role) | REST | Create quizzes, questions, sessions, upload media |
| **Host Control** | JWT (host role) | REST + WebSocket | Control live game flow (start, next Q, reveal, etc.) |
| **Player Mobile** | None (PIN-based) | WebSocket | Join via 6-digit PIN, answer questions |
| **Venue Display** | None | WebSocket | Big-screen display (QR code, questions, scoreboard) |

---

## 2. Data Model & Relationships

```mermaid
erDiagram
    Quiz ||--o{ Round : "has many"
    Round ||--o{ Question : "has many"
    Session ||--o{ Team : "has many"
    Team ||--o{ Answer : "has many"
    Session }o--|| Quiz : "uses"
    
    Quiz {
        int id
        string title
        string description
    }
    Round {
        int id
        string name
        enum type
        int order
        int timerDuration
    }
    Question {
        int id
        string text
        json options
        string mediaUrl
        string mediaType
        int order
    }
    Session {
        int id
        string pin
        int quizId
        string hostToken
        enum status
        string qrCodeData
        int maxTeams
    }
    Team {
        int id
        string teamName
        int score
        boolean isConnected
        boolean isEliminated
        string socketId
    }
```

**Two storage layers operate simultaneously:**

| Layer | What it stores | Why |
|-------|---------------|-----|
| **MySQL** (Sequelize) | Quizzes, rounds, questions, sessions, teams, answers | Persistent, survives restarts |
| **Redis** (or in-memory Map fallback) | Live game state, lobby teams, responses per question | Fast reads/writes during gameplay |

### Redis Key Patterns

| Key | Data |
|-----|------|
| `session:{pin}` | `{ sessionId }` — maps PIN to DB session |
| `game:{pin}:state` | Full game state object (rounds, scores, current question, timer, etc.) |
| `game:{pin}:lobby` | Hash of team objects in lobby |
| `game:{pin}:teams` | Hash of team data with live scores |
| `game:{pin}:responses:{questionId}` | Hash of `teamId → JSON(response)` per question |

All keys have a 24h TTL. Redis operations always have an in-memory `Map` fallback via [redisSessionStore.js](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/redisSessionStore.js).

---

## 3. Game State Machine

The game engine at [stateMachine.js](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/stateMachine.js) enforces strict state transitions:

```mermaid
stateDiagram-v2
    [*] --> LOBBY
    LOBBY --> ROUND_INTRO : start_game
    ROUND_INTRO --> WAGER_COLLECTION : collect_wagers (wager rounds)
    ROUND_INTRO --> QUESTION : next_question (non-wager)
    WAGER_COLLECTION --> QUESTION : next_question
    QUESTION --> SCOREBOARD : end_round (last Q answered)
    SCOREBOARD --> QUESTION : next_question (same round)
    SCOREBOARD --> ROUND_INTRO : advance_round (next round)
    SCOREBOARD --> FINAL_RESULTS : advance_round (no more rounds)
    
    ROUND_INTRO --> BREAK : start_break
    QUESTION --> BREAK : start_break
    SCOREBOARD --> BREAK : start_break
    BREAK --> ROUND_INTRO : end_break
    BREAK --> MINI_GAME : launch_mini_game
    MINI_GAME --> BREAK : end_mini_game
    
    FINAL_RESULTS --> [*]
```

### Question Sub-States

Within the `QUESTION` state, each question goes through:

```
WAITING → ACTIVE → REVEALED
```

- **WAITING**: Question loaded, not yet shown to players
- **ACTIVE**: Timer running, accepting answers
- **REVEALED**: Correct answer shown, scores calculated

---

## 4. Complete Socket Event Catalog

All event names are defined in the shared [socketEvents.js](file:///d:/Apurv/Projects/showdown_trivia/shared/constants/socketEvents.js) — used by both client and server.

### 4.1 Player → Server Events

| Event | Payload | Handler | What Happens |
|-------|---------|---------|-------------|
| `join_session` | `{ pin, teamName }` | [playerHandlers.js:27](file:///d:/Apurv/Projects/showdown_trivia/server/src/socket/playerHandlers.js#L27) | Validates PIN, creates/reconnects team, joins socket room `session:{pin}`, emits full state back |
| `leave_session` | — | [playerHandlers.js:299](file:///d:/Apurv/Projects/showdown_trivia/server/src/socket/playerHandlers.js#L299) | Marks team disconnected, removes from live state, leaves socket room |
| `submit_answer` | `{ selectedOptionIndex, wagerAmount? }` | [playerHandlers.js:316](file:///d:/Apurv/Projects/showdown_trivia/server/src/socket/playerHandlers.js#L316) | Records answer in Redis, broadcasts response count and live stats |
| `submit_wager` | `{ amount }` | [playerHandlers.js:330](file:///d:/Apurv/Projects/showdown_trivia/server/src/socket/playerHandlers.js#L330) | Locks wager for current round (once per round, can't change) |
| `disconnect` | — (auto) | [playerHandlers.js:341](file:///d:/Apurv/Projects/showdown_trivia/server/src/socket/playerHandlers.js#L341) | Same as leave — cleans up team from live state |

### 4.2 Host → Server Events

| Event | Payload | Handler | What Happens |
|-------|---------|---------|-------------|
| `start_game` | `{ pin }` | [hostHandlers.js:32](file:///d:/Apurv/Projects/showdown_trivia/server/src/socket/hostHandlers.js#L32) | Loads quiz from DB, initializes game state, transitions LOBBY→ROUND_INTRO |
| `next_question` | `{ pin }` | [gameController.js:171](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/gameController.js#L171) | Advances question index, activates question, starts timer |
| `collect_wagers` | `{ pin }` | [gameController.js:1247](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/gameController.js#L1247) | Transitions to WAGER_COLLECTION state |
| `start_timer` | `{ pin }` | [gameController.js:1081](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/gameController.js#L1081) | Resumes a paused timer |
| `pause_timer` | `{ pin }` | [gameController.js:1072](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/gameController.js#L1072) | Pauses the countdown timer |
| `reveal_answer` | `{ pin }` | [gameController.js:415](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/gameController.js#L415) | Stops timer, calculates scores, handles eliminations, broadcasts results |
| `show_scoreboard` | `{ pin }` | [gameController.js:787](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/gameController.js#L787) | Shows scoreboard overlay without changing state |
| `hide_scoreboard` | `{ pin }` | [gameController.js:809](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/gameController.js#L809) | Hides scoreboard overlay |
| `advance_round` | `{ pin }` | [gameController.js:633](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/gameController.js#L633) | Moves to next round or FINAL_RESULTS if no more rounds |
| `start_break` | `{ pin }` | [gameController.js:822](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/gameController.js#L822) | Saves current state, transitions to BREAK |
| `end_break` | `{ pin }` | [gameController.js:872](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/gameController.js#L872) | Restores saved state, resumes game |
| `launch_mini_game` | `{ pin, game, config }` | [gameController.js:990](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/gameController.js#L990) | Activates Unity mini-game (e.g. card_shuffle) |
| `end_mini_game` | `{ pin, config }` | [gameController.js:1046](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/gameController.js#L1046) | Clears mini-game state |
| `add_team` | `{ pin, teamName, score? }` | [hostHandlers.js:196](file:///d:/Apurv/Projects/showdown_trivia/server/src/socket/hostHandlers.js#L196) | Manually adds a team during game |
| `remove_team` | `{ pin, teamId }` | [hostHandlers.js:271](file:///d:/Apurv/Projects/showdown_trivia/server/src/socket/hostHandlers.js#L271) | Purges team from DB + Redis + game state |
| `edit_team_score` | `{ pin, teamId, score }` | [hostHandlers.js:283](file:///d:/Apurv/Projects/showdown_trivia/server/src/socket/hostHandlers.js#L283) | Manually adjusts team score |
| `end_game` | `{ pin }` | [gameController.js:1135](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/gameController.js#L1135) | Force-ends game, persists scores, cleans up |
| `music_control` | `{ pin, action, mediaUrl? }` | [hostHandlers.js:183](file:///d:/Apurv/Projects/showdown_trivia/server/src/socket/hostHandlers.js#L183) | Pass-through to all clients for music playback |

### 4.3 Server → Client Events (Broadcasts)

| Event | When Emitted | Payload Summary |
|-------|-------------|-----------------|
| `session_state` | Join, state changes, reconnect | Full/partial game state snapshot |
| `round_intro` | New round begins | Round name, type, index |
| `wager_collection_start` | Wager round begins | Round info for wager input |
| `question_active` | Question shown to players | Question text, options (no correct flag), timer |
| `timer_update` | Every second during countdown | `{ remaining }` |
| `timer_expired` | Timer hits zero | `{}` |
| `response_count` | After each answer | `{ count, total }` |
| `live_response_update` | After each answer | `{ correct, incorrect, noAnswer, total }` |
| `auto_reveal` | All teams answered | `{}` — signals host to reveal |
| `answer_reveal` | Host reveals answer | Correct index, per-team scores, response details, eliminations |
| `scoreboard` | Round end or manual toggle | Sorted teams array |
| `round_end` | Last question in round revealed | `{ roundIndex }` |
| `team_joined` | Team joins lobby | Team data |
| `team_removed` | Team leaves/kicked | `{ teamId }` |
| `team_updated` | Score edited | Team data |
| `player_eliminated` | Elimination round | `{ teamId }` |
| `break_start` / `break_end` | Break toggled | Duration |
| `mini_game_start` / `mini_game_end` | Mini-game lifecycle | Game type + config |
| `game_end` | Final round done or force-end | Sorted teams array |
| `session_deleted` | Admin deletes session | — |

### 4.4 Reconnection Events

| Event | Actor | Handler |
|-------|-------|---------|
| `venue_connect` | Venue display | [venueHandlers.js:15](file:///d:/Apurv/Projects/showdown_trivia/server/src/socket/venueHandlers.js#L15) |
| `host_connect` | Host dashboard | [venueHandlers.js:83](file:///d:/Apurv/Projects/showdown_trivia/server/src/socket/venueHandlers.js#L83) |
| `join_session` (with existing team name) | Player | [playerHandlers.js:27](file:///d:/Apurv/Projects/showdown_trivia/server/src/socket/playerHandlers.js#L27) |

All three rebuild the full state payload and replay the appropriate events (e.g., if reconnecting during `QUESTION` state, the question + timer position are re-sent).

---

## 5. Full Game Lifecycle — Step by Step

### Phase 1: Setup (REST, Admin Panel)

```mermaid
sequenceDiagram
    participant Admin
    participant Server
    participant DB
    
    Admin->>Server: POST /api/auth/login
    Server-->>Admin: JWT token
    Admin->>Server: POST /api/quizzes (create quiz)
    Server->>DB: INSERT Quiz
    Admin->>Server: POST /api/questions (add questions to rounds)
    Server->>DB: INSERT Questions
    Admin->>Server: POST /api/sessions (create session with quiz)
    Server->>DB: INSERT Session (generates 6-digit PIN + QR)
    Server-->>Admin: { pin, qrCodeData, ... }
```

### Phase 2: Lobby (WebSocket)

```mermaid
sequenceDiagram
    participant Host
    participant Server
    participant Redis
    participant Player
    participant Venue
    
    Host->>Server: host_connect({ pin })
    Server->>Redis: getGameState / getLobbyTeams
    Server-->>Host: session_state({ state: LOBBY, teams, qrCodeData })
    
    Venue->>Server: venue_connect({ pin })
    Server-->>Venue: session_state({ state: LOBBY, qrCodeData })
    
    Player->>Server: join_session({ pin, teamName })
    Server->>DB: CREATE/FIND Team
    Server->>Redis: addTeamToLobby
    Server-->>Player: session_state({ joined: true, teamId, ... })
    Server-->>Host: team_joined({ teamId, teamName })
    Server-->>Venue: team_joined({ teamId, teamName })
```

### Phase 3: Active Game (WebSocket)

```mermaid
sequenceDiagram
    participant Host
    participant Server
    participant Redis
    participant Player
    participant Venue
    
    Host->>Server: start_game({ pin })
    Server->>DB: Load Quiz + Rounds + Questions
    Server->>Redis: setGameState (LOBBY→ROUND_INTRO)
    Server-->>Host: round_intro + session_state
    Server-->>Player: round_intro + session_state
    Server-->>Venue: round_intro + session_state
    
    Host->>Server: next_question({ pin })
    Server->>Redis: activateQuestion
    Server-->>Host: question_active (full question + correct answers)
    Server-->>Player: question_active (options WITHOUT correct flag)
    Server-->>Venue: question_active
    
    Note over Server: Timer starts (1s ticks)
    loop Every second
        Server-->>Host: timer_update({ remaining })
        Server-->>Player: timer_update({ remaining })
        Server-->>Venue: timer_update({ remaining })
    end
    
    Player->>Server: submit_answer({ selectedOptionIndex })
    Server->>Redis: recordResponse
    Server-->>Host: response_count + live_response_update
    Server-->>Venue: response_count + live_response_update
    
    Note over Server: All teams answered → auto_reveal emitted
    
    Host->>Server: reveal_answer({ pin })
    Server->>Redis: getResponses → calculateScores
    Server->>Redis: update team scores
    Server->>DB: persistScoresToDB (async)
    Server-->>Host: answer_reveal (scores, details, eliminations)
    Server-->>Player: answer_reveal
    Server-->>Venue: answer_reveal
```

### Phase 4: Round Transitions

```mermaid
sequenceDiagram
    participant Host
    participant Server
    
    Note over Host,Server: After last question in round
    Host->>Server: next_question → detects no more questions
    Server-->>Host: round_end + scoreboard
    
    Host->>Server: advance_round({ pin })
    alt More rounds exist
        Server-->>Host: round_intro (next round)
    else No more rounds
        Server-->>Host: game_end (final results)
        Note over Server: Session marked "completed"
        Note over Server: Redis cleanup after 2s delay
    end
```

---

## 6. Scoring Engine

The [scoringEngine.js](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/scoringEngine.js) delegates to per-round-type handlers:

| Round Type | Handler | Scoring Logic |
|------------|---------|--------------|
| `MULTIPLE_CHOICE` | [multipleChoice.js](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/roundHandlers/multipleChoice.js) | +2 correct, -1 wrong |
| `WAGER` | [wager.js](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/roundHandlers/wager.js) | ±wagered amount (locked pre-question) |
| `MUSIC` | [music.js](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/roundHandlers/music.js) | +2 correct, -1 wrong (timer starts paused for music playback) |
| `ELIMINATION` | [elimination.js](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/roundHandlers/elimination.js) | +2 correct, eliminated if wrong (unless ALL wrong → no one eliminated) |
| `MAJORITY_RULES` | [majorityRules.js](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/roundHandlers/majorityRules.js) | Points = number of teams who chose the same option |
| `FINAL_MULTIPLE_CHOICE` | [finalMultipleChoice.js](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/roundHandlers/finalMultipleChoice.js) | +3 correct, -1 wrong |
| `FINAL_WAGER` | [finalWager.js](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/roundHandlers/finalWager.js) | ±wagered percentage of current score |

### Wager Flow (Special)

Wager rounds have an extra phase:

```
ROUND_INTRO → WAGER_COLLECTION → QUESTION → ...
```

1. Host clicks "Next" on a wager round → `collect_wagers` auto-fires
2. Server transitions to `WAGER_COLLECTION` state, emits `wager_collection_start`
3. Players see a wager input slider and submit via `submit_wager`
4. Wager is **locked once per round** — can't change
5. Host clicks "Next" again → transitions to `QUESTION`
6. On reveal, the locked wager amount is used for scoring (±wager)

### Elimination Flow (Special)

- Teams answering **wrong are eliminated** (`isEliminated: true`) and removed from `activeTeamIds`
- **Exception**: if **ALL teams answer wrong**, nobody is eliminated (the "all-wrong rule")
- Elimination state resets between rounds — teams come back for the next round
- The [knockoutEngine.js](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/knockoutEngine.js) tracks elimination state per-PIN in memory

---

## 7. Client-Side Socket Architecture

### Socket Singleton ([socket.ts](file:///d:/Apurv/Projects/showdown_trivia/client/lib/socket.ts))

- Single `Socket.io` instance shared across all pages via `getSocket()`
- Uses WebSocket transport with polling fallback
- Auto-reconnects (10 attempts, 1-5s delay)
- Connection state recovery enabled (120s window)
- All outgoing/incoming events are logged via `clientLogger`

### useSocket Hook ([useSocket.ts](file:///d:/Apurv/Projects/showdown_trivia/client/hooks/useSocket.ts))

- Returns `{ socket, isConnected }`
- Socket is **NOT disconnected on unmount** — it persists across page navigations
- Only local event listeners are cleaned up on unmount

### Connection Flow per Client Type

```mermaid
graph TD
    subgraph "Player Mobile"
        P1["Enter PIN + Team Name"] --> P2["emit join_session"]
        P2 --> P3["Receive session_state"]
        P3 --> P4["socket.join room"]
    end
    
    subgraph "Host Dashboard"
        H1["Login via REST"] --> H2["emit host_connect({pin})"]
        H2 --> H3["Receive full state"]
    end
    
    subgraph "Venue Display"
        V1["Open /venue/display?pin=..."] --> V2["emit venue_connect({pin})"]
        V2 --> V3["Receive full state + QR"]
    end
```

---

## 8. Socket Middleware & Security

### Socket Guard ([socketGuard.js](file:///d:/Apurv/Projects/showdown_trivia/server/src/middleware/socketGuard.js))

Wraps every incoming socket event:
- Validates that `pin` (if present) is exactly 6 digits
- Rejects malformed PINs with an error emit
- Does **NOT** authenticate — players join purely by PIN

### Socket Room Pattern

All clients in a session join the room `session:{pin}`. Every broadcast uses:
```js
io.to(`session:${pin}`).emit(EVENT, payload);
```

This ensures events are scoped to the correct game session.

---

## 9. Key Data Flow Summary

```mermaid
flowchart TB
    subgraph "Persistent (MySQL)"
        A1["Quiz/Round/Question"] --> A2["Session (pin, status)"]
        A2 --> A3["Team (score, isConnected)"]
        A3 --> A4["Answer records"]
    end
    
    subgraph "Live (Redis/Memory)"
        B1["game:{pin}:state<br/>Full game state"] 
        B2["game:{pin}:lobby<br/>Teams in lobby"]
        B3["game:{pin}:responses:{qId}<br/>Answers per question"]
    end
    
    subgraph "Score Lifecycle"
        C1["Player submits answer"] --> C2["Stored in Redis responses"]
        C2 --> C3["Host reveals → scoringEngine calculates"]
        C3 --> C4["Redis gameState updated"]
        C4 --> C5["MySQL Team.score updated async"]
    end
```

> [!IMPORTANT]
> **Scores live in Redis during gameplay** and are periodically persisted to MySQL asynchronously (`persistScoresToDB`). The MySQL write happens on every `revealAnswer` call and also on `endGame` / natural game completion. This means a server crash mid-game could lose the most recent question's scores.

> [!NOTE]  
> **Timer management** is handled server-side by [timerManager.js](file:///d:/Apurv/Projects/showdown_trivia/server/src/services/game-engine/timerManager.js) using `setInterval` with 1s ticks. The timer state (remaining seconds) is stored in the game state and synced to clients. When all active teams have answered, `forceExpire` stops the timer early and emits `auto_reveal`.

---

## 10. Mini-Game Integration

Mini-games (e.g., `card_shuffle`) are **Unity WebGL builds** embedded via `react-unity-webgl`:

1. Host clicks "Launch Mini-Game" → `launch_mini_game` event
2. Server sets `activeMiniGame` in game state and creates mini-game specific state
3. All clients receive `mini_game_start` and render the Unity iframe
4. Unity ↔ React communication happens via [miniGameHandlers.js](file:///d:/Apurv/Projects/showdown_trivia/server/src/socket/miniGameHandlers.js)
5. Server tracks picks, reveals correct position, broadcasts results per player
6. Host ends mini-game → `end_mini_game` → state cleared, `mini_game_end` broadcast

---

## 11. Session Cleanup

When a game ends (naturally or force-ended):

1. Session status updated to `completed` in MySQL
2. After a 2-second delay:
   - All Redis keys for `game:{pin}:*` and `session:{pin}` are deleted
   - All sockets are removed from the `session:{pin}` room
3. `game_end` event sent with final sorted team standings
