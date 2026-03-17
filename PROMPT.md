# Max Showdown Trivia — Production Build Prompt

You are building Max Showdown Trivia — a real-time web-based live trivia platform for venues.
Read and follow .cursor/rules/max-showdown-trivia.mdc for project spec, scoring, and flows.

## SCOPE

Build a production-ready trivia platform with:

1. **Admin Panel** — quiz builder, question bank (2–6 options), MP3/MP4 upload, session config, PIN + QR generation
2. **Host Control Panel** — game controls, timers (T/P/Space/S), manual team management, music/video controls, break, mini-game launcher
3. **Player Mobile Interface** — join via QR+PIN, lobby, Q&A, wager input, feedback, reconnection
4. **Venue Display Screen** — 16:9, welcome, registration grid, questions, timer, scoreboard, QR, break timer, mini-game display
5. **Backend Game Engine** — state machine, Socket.io, scoring engine, 7 round types, knockout logic
6. **Unity WebGL Mini-Games** — embed Horse Race and Card Shuffle builds; bridge to Socket.io for player input and venue sync

## TECH STACK

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion
- **Backend:** Node.js, Fastify, Socket.io
- **Database:** MySQL, Sequelize
- **Cache:** Redis (game state, presence)
- **Validation:** Zod
- **Mini-Games:** Unity WebGL (pre-built), react-unity-webgl for embedding
- **Media:** S3-compatible storage (local for dev)
- **Workspaces:** npm workspaces (simple split, no Turborepo)

No C#, Unity development, PostgreSQL, Prisma, Docker, or Turborepo.

## ARCHITECTURE (300+ concurrent users)

- Sticky sessions for WebSocket affinity
- Redis for live game state, lobby, scores
- MySQL for quizzes, questions, sessions, teams
- One game server process per session (or sticky routing)
- npm workspaces for shared code between client and server

## PROJECT STRUCTURE (Simple Split + npm Workspaces)

```
showdown_trivia/
│
├── .cursor/
│   └── rules/
│       └── max-showdown-trivia.mdc
│
├── client/                                 # Next.js 14 (App Router)
│   ├── app/
│   │   ├── (admin)/                        # Admin Panel
│   │   │   ├── quizzes/
│   │   │   │   ├── page.tsx                # Quiz list
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx            # Create quiz
│   │   │   │   └── [quizId]/
│   │   │   │       ├── page.tsx            # Edit quiz
│   │   │   │       └── preview/
│   │   │   │           └── page.tsx        # Quiz preview
│   │   │   ├── questions/
│   │   │   │   ├── page.tsx                # Question bank
│   │   │   │   └── new/
│   │   │   │       └── page.tsx            # Add question
│   │   │   ├── sessions/
│   │   │   │   ├── page.tsx                # Session list
│   │   │   │   └── new/
│   │   │   │       └── page.tsx            # Create session (PIN + QR)
│   │   │   ├── media/
│   │   │   │   └── page.tsx                # MP3/MP4 upload & manage
│   │   │   └── layout.tsx                  # Admin layout (sidebar, nav)
│   │   │
│   │   ├── (host)/                         # Host Control Panel
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx                # Live game dashboard
│   │   │   ├── sessions/
│   │   │   │   └── page.tsx                # Select/start session
│   │   │   ├── teams/
│   │   │   │   └── page.tsx                # Manual team management
│   │   │   └── layout.tsx                  # Host layout
│   │   │
│   │   ├── (player)/                       # Player Mobile Interface
│   │   │   ├── join/
│   │   │   │   └── page.tsx                # Enter PIN + team name
│   │   │   ├── lobby/
│   │   │   │   └── page.tsx                # Waiting screen
│   │   │   ├── game/
│   │   │   │   └── page.tsx                # Q&A, wager, elimination, majority
│   │   │   ├── mini-game/
│   │   │   │   └── page.tsx                # Horse race / card shuffle input
│   │   │   └── layout.tsx                  # Player layout (mobile-first)
│   │   │
│   │   ├── (venue)/                        # Venue Display Screen
│   │   │   ├── display/
│   │   │   │   └── page.tsx                # Main venue display (all states)
│   │   │   └── layout.tsx                  # Venue layout (16:9, fullscreen)
│   │   │
│   │   ├── layout.tsx                      # Root layout
│   │   ├── page.tsx                        # Landing / redirect
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── admin/
│   │   │   ├── QuizForm.tsx
│   │   │   ├── QuestionForm.tsx
│   │   │   ├── QuestionBankTable.tsx
│   │   │   ├── SessionForm.tsx
│   │   │   ├── MediaUploader.tsx
│   │   │   ├── RoundConfigurator.tsx
│   │   │   └── QuizPreview.tsx
│   │   │
│   │   ├── host/
│   │   │   ├── GameDashboard.tsx
│   │   │   ├── GameControls.tsx
│   │   │   ├── MusicControls.tsx
│   │   │   ├── VideoControls.tsx
│   │   │   ├── TeamManager.tsx
│   │   │   ├── BreakControls.tsx
│   │   │   ├── MiniGameLauncher.tsx
│   │   │   └── LiveScoreboard.tsx
│   │   │
│   │   ├── player/
│   │   │   ├── JoinForm.tsx
│   │   │   ├── LobbyScreen.tsx
│   │   │   ├── QuestionCard.tsx
│   │   │   ├── AnswerOptions.tsx
│   │   │   ├── WagerInput.tsx
│   │   │   ├── AnswerFeedback.tsx
│   │   │   ├── KnockoutPopup.tsx
│   │   │   ├── MajorityVote.tsx
│   │   │   └── ReconnectBanner.tsx
│   │   │
│   │   ├── venue/
│   │   │   ├── WelcomeScreen.tsx
│   │   │   ├── TeamRegistrationGrid.tsx
│   │   │   ├── RoundIntro.tsx
│   │   │   ├── QuestionDisplay.tsx
│   │   │   ├── CountdownTimer.tsx
│   │   │   ├── LiveResponseCounter.tsx
│   │   │   ├── AnswerReveal.tsx
│   │   │   ├── ScoreboardDisplay.tsx
│   │   │   ├── QRCodeOverlay.tsx
│   │   │   ├── BreakTimer.tsx
│   │   │   ├── PointsDisplay.tsx
│   │   │   └── VideoPlayer.tsx
│   │   │
│   │   ├── mini-games/
│   │   │   ├── UnityWrapper.tsx            # react-unity-webgl generic wrapper
│   │   │   ├── HorseRaceGame.tsx
│   │   │   └── CardShuffleGame.tsx
│   │   │
│   │   └── shared/
│   │       ├── Button.tsx
│   │       ├── Modal.tsx
│   │       ├── Timer.tsx
│   │       ├── LoadingSpinner.tsx
│   │       ├── ErrorBoundary.tsx
│   │       └── QRCode.tsx
│   │
│   ├── hooks/
│   │   ├── useSocket.ts
│   │   ├── useGameState.ts
│   │   ├── useTimer.ts
│   │   ├── useKeyboardShortcuts.ts
│   │   └── useReconnect.ts
│   │
│   ├── lib/
│   │   ├── socket.ts
│   │   ├── api.ts
│   │   └── utils.ts
│   │
│   ├── public/
│   │   ├── games/
│   │   │   ├── horse-race/
│   │   │   │   └── Build/
│   │   │   └── card-shuffle/
│   │   │       └── Build/
│   │   ├── sounds/
│   │   │   └── timer-tick.mp3
│   │   └── images/
│   │       └── logo.svg
│   │
│   ├── styles/
│   │   └── globals.css
│   │
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── server/                                 # Node.js + Fastify + Socket.io
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js
│   │   │   ├── redis.js
│   │   │   └── env.js
│   │   │
│   │   ├── models/
│   │   │   ├── index.js
│   │   │   ├── Quiz.js
│   │   │   ├── Round.js
│   │   │   ├── Question.js
│   │   │   ├── Session.js
│   │   │   ├── Team.js
│   │   │   └── Answer.js
│   │   │
│   │   ├── migrations/
│   │   │   ├── 001-create-quiz.js
│   │   │   ├── 002-create-round.js
│   │   │   ├── 003-create-question.js
│   │   │   ├── 004-create-session.js
│   │   │   ├── 005-create-team.js
│   │   │   └── 006-create-answer.js
│   │   │
│   │   ├── seeders/
│   │   │   └── demo-quiz.js
│   │   │
│   │   ├── controllers/
│   │   │   ├── quizController.js
│   │   │   ├── questionController.js
│   │   │   ├── sessionController.js
│   │   │   ├── teamController.js
│   │   │   └── mediaController.js
│   │   │
│   │   ├── services/
│   │   │   ├── quizService.js
│   │   │   ├── questionService.js
│   │   │   ├── sessionService.js
│   │   │   ├── teamService.js
│   │   │   ├── mediaService.js
│   │   │   └── game-engine/
│   │   │       ├── stateMachine.js
│   │   │       ├── scoringEngine.js
│   │   │       ├── knockoutEngine.js
│   │   │       ├── timerManager.js
│   │   │       └── roundHandlers/
│   │   │           ├── multipleChoice.js
│   │   │           ├── wager.js
│   │   │           ├── music.js
│   │   │           ├── elimination.js
│   │   │           ├── majorityRules.js
│   │   │           ├── finalMultipleChoice.js
│   │   │           └── finalWager.js
│   │   │
│   │   ├── socket/
│   │   │   ├── index.js
│   │   │   ├── hostHandlers.js
│   │   │   ├── playerHandlers.js
│   │   │   ├── venueHandlers.js
│   │   │   └── miniGameHandlers.js
│   │   │
│   │   ├── routes/
│   │   │   ├── quizRoutes.js
│   │   │   ├── questionRoutes.js
│   │   │   ├── sessionRoutes.js
│   │   │   ├── teamRoutes.js
│   │   │   └── mediaRoutes.js
│   │   │
│   │   ├── middleware/
│   │   │   ├── errorHandler.js
│   │   │   ├── authMiddleware.js
│   │   │   └── validateRequest.js
│   │   │
│   │   ├── utils/
│   │   │   ├── qrGenerator.js
│   │   │   ├── pinGenerator.js
│   │   │   ├── logger.js
│   │   │   └── responseWrapper.js
│   │   │
│   │   └── index.js
│   │
│   ├── uploads/
│   ├── .sequelizerc
│   ├── nodemon.json
│   └── package.json
│
├── shared/                                 # Shared between client & server
│   ├── schemas/
│   │   ├── quiz.js
│   │   ├── question.js
│   │   ├── session.js
│   │   ├── team.js
│   │   └── answer.js
│   │
│   ├── constants/
│   │   ├── gameStates.js
│   │   ├── questionStates.js
│   │   ├── roundTypes.js
│   │   ├── socketEvents.js
│   │   └── scoring.js
│   │
│   ├── types/
│   │   └── index.ts
│   │
│   ├── index.js
│   └── package.json
│
├── .env.example
├── .gitignore
├── .eslintrc.json
├── .prettierrc
├── package.json                            # Root — npm workspaces
└── PROMPT.md
```

## ROOT package.json (npm workspaces)

```json
{
  "name": "showdown-trivia",
  "private": true,
  "workspaces": ["client", "server", "shared"],
  "scripts": {
    "dev": "concurrently \"npm run dev -w client\" \"npm run dev -w server\"",
    "dev:client": "npm run dev -w client",
    "dev:server": "npm run dev -w server",
    "build": "npm run build -w shared && npm run build -w client",
    "lint": "eslint ."
  }
}
```

## .env.example

```env
# MySQL (local)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=showdown_trivia
DB_USER=root
DB_PASSWORD=

# Redis (local: redis-server)
REDIS_URL=redis://localhost:6379

# Server
PORT=3001

# Client
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001

# Media (local for dev; S3 for prod)
UPLOAD_DIR=./uploads
```

## DELIVERABLES (implement in order)

### Phase 1: Foundation

- Root package.json with npm workspaces (client, server, shared)
- Next.js 14 scaffold in client/ with App Router, Tailwind, TypeScript
- Fastify + Socket.io scaffold in server/
- Shared folder with Zod schemas, constants, types
- .env.example, .gitignore, ESLint, Prettier (2 spaces)
- Basic health check endpoint (GET /health)
- `npm run dev` starts both client and server via concurrently

### Phase 2: Data & Auth

- Sequelize models: Quiz, Round, Question, Session, Team, Answer
- Migrations for MySQL schema
- Redis client setup and session/lobby helpers
- Simple host auth (session token or PIN-based for MVP)

### Phase 3: Game Engine (Backend)

- Game state machine in server/src/services/game-engine/stateMachine.js
- States: LOBBY, ROUND_INTRO, QUESTION, SCOREBOARD, BREAK, MINI_GAME, FINAL_WAGER, FINAL_RESULTS
- Question sub-states: WAITING, ACTIVE, REVEALED
- Scoring engine for all 7 round types (separate handler per round type in roundHandlers/)
- Knockout logic (12 Qs, 10–120 pts, all-teams-wrong rule)
- Socket.io events via shared/constants/socketEvents.js
- Auto-reveal when all teams answer before timer
- Timer manager with pause/resume

### Phase 4: Admin Panel

- Quiz CRUD (client/app/(admin)/quizzes)
- Question bank with search, categories, 2–6 options per question
- MP3/MP4 upload to server/uploads/ (local for dev)
- Session creation, PIN + QR generation
- Round config, timer defaults, max teams
- Quiz preview (read-only flow)

### Phase 5: Host Control Panel

- Dashboard: question X/Total, round name/type, connected teams, response count, live scoreboard, points per question
- Game controls: Start Timer (T), Pause (P), Reveal Answer (button), Next Question (Space), Show Scoreboard (S)
- Music round: MP3 play/pause; Video: MP4 play/pause
- Manual team management: add team (custom score), remove team, edit any team's score
- Break: start/end break
- Mini-game launcher: Horse Race, Card Shuffle

### Phase 6: Player Mobile Interface

- Join: scan QR → enter PIN + team name
- Lobby: waiting screen, team name, connected confirmation
- Q&A: 2–6 answer options as tappable cards, first answer final (locked), countdown visible
- Wager: standard (0–50 pts before question), final (0–100% of total score)
- Answer reveal: green (correct) / red (incorrect) feedback, points gained/lost
- Elimination: knockout pop-up ("Unfortunately, you've been knocked out until the end of the round."), disabled until next round
- Majority Rules: vote on options, majority +50, minority −50
- Reconnection: same PIN + team name, restore score from Redis
- Mini-game interaction: bet on horse, pick card → Socket.io

### Phase 7: Venue Display Screen

- Welcome screen (branded, animated logo)
- Team registration grid (numbered slots, green tick on join, team name)
- Round intro slide (round name, type)
- Question display (text, 2–6 options, optional MP4 video)
- Countdown timer, live response counter
- Answer reveal (correct highlighted), scoreboard display, points display
- Persistent QR code on every view
- Break timer (e.g. 6 minutes)
- Unity WebGL embed for Horse Race and Card Shuffle
- 16:9 layout, dark theme, primary accent color #6706AB (purple), clean typography, smooth animations

### Phase 8: Unity WebGL Integration

- Placeholder paths: client/public/games/horse-race/Build/, client/public/games/card-shuffle/Build/
- react-unity-webgl wrapper component in client/components/mini-games/UnityWrapper.tsx
- JSLib bridge: Unity → web (player choice) → Socket.io
- Web → Unity: start game, reset via SendMessage
- Lazy load Unity with next/dynamic (ssr: false), only on venue + player mini-game views

### Phase 9: Media & Polish

- MP3 playback on host/venue via Web Audio API
- MP4 playback on venue screen only; no video on player devices
- Timer sound plays during all rounds except Music rounds (muted)
- No audio on player devices at any point
- Responsive player UI for mobile (touch-friendly tappable cards)
- Framer Motion transitions between game states and screens

### Phase 10: Edge Cases & Production

- Duplicate team name in same session: reject or append suffix
- Reconnection: restore from Redis; host can manually re-add team with previous score if data lost
- Host/venue browser refresh: reconnect via Socket.io and restore full state
- Majority Rules tie: all tied teams get +50
- Block "Start Game" if no teams in lobby
- Wager round: team misses wager submission → default to 0 or block
- Late join: teams can join after session starts via persistent QR
- Video questions: MP4 on venue only; players see text + options only
- Error handling with meaningful HTTP status codes (400, 401, 404, 500)
- Winston logger in server for structured logging
- Env-based config (dev/prod) via server/src/config/env.js with Zod validation

## CODE STANDARDS

- Layered architecture: Controller → Service → Repository (model)
- camelCase for variables and functions, PascalCase for React components and classes
- Try/catch in all async functions; return meaningful error responses
- Zod schemas in shared/schemas/ for input validation on both client and server
- No hardcoded secrets; all config via .env
- JSDoc comments for all exported functions and services
- Prefer const/let over var; async/await over promise chains
- 2-space indentation; Prettier + ESLint enforced
- One concern per file; keep functions short and focused
- Consistent API response format via server/src/utils/responseWrapper.js

## DO NOT

- Implement full auth (OAuth, JWT refresh, etc.); use simple host token or PIN-based auth for MVP
- Add analytics, result exports, historical leaderboards, or Phase 2 SaaS features
- Implement Unity game logic (C#); only embed pre-built WebGL and bridge events
- Skip any edge cases listed in the rules
- Use Docker, PostgreSQL, Prisma, or Turborepo
- Add unnecessary comments that narrate what the code does

## SUCCESS CRITERIA

- `npm install` at root installs all three workspaces (client, server, shared)
- `npm run dev` starts both Next.js client and Fastify server concurrently
- Host can create a quiz in Admin Panel, start a session, and run the full game flow through all 7 round types
- Players join via QR code + PIN, answer questions, see correct/incorrect feedback; reconnection works
- Venue display shows the correct state for every game phase: welcome, registration, questions, timer, reveal, scoreboard, break, mini-games
- Knockout (Elimination) round works per spec: 12 questions, incremental 10–120 pts, all-teams-wrong rule
- Break flow works: host starts break, launches mini-game(s), ends break
- Manual team management works: add, remove, edit score during live session
- Clean, production-oriented folder structure ready for continued feature development

