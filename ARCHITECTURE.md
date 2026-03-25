# Max Showdown Trivia — Architecture

## Overview

Max Showdown Trivia is a real-time live trivia platform designed for venues, supporting 300+ concurrent players. It consists of four interconnected interfaces — Admin Panel, Host Control Panel, Player Mobile Interface, and Venue Display Screen — all communicating through REST APIs and WebSockets.

## Tech Stack

| Layer              | Technology                                                                 |
| ------------------ | -------------------------------------------------------------------------- |
| Frontend           | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Framer Motion |
| Backend            | Node.js, Fastify, Socket.io                                                |
| Database           | MySQL + Sequelize ORM                                                      |
| Cache / Live State | Redis (ioredis) with in-memory fallback                                    |
| Validation         | Zod (shared schemas)                                                       |
| Auth               | JWT (jsonwebtoken)                                                         |
| Media              | Local file storage (S3-compatible in production)                           |
| 3D Mini-Games      | Unity WebGL builds embedded via react-unity-webgl                          |
| Audio              | Web Audio API (synthesized timer sounds, MP3 playback)                     |
| Monorepo           | npm workspaces (client, server, shared)                                    |

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────┐  ┌───────────┐ │
│  │ Admin Panel  │  │ Host Control │  │ Player  │  │  Venue    │ │
│  │ /admin/*     │  │ /host/*      │  │ /play/* │  │ /venue/*  │ │
│  └──────┬───── ┘  └──────┬───────┘  └────┬────┘  └─────┬─────┘ │
│         │                │               │              │        │
│         │  REST API      │  REST + WS    │  WebSocket   │  WS   │
└─────────┼────────────────┼───────────────┼──────────────┼────────┘
          │                │               │              │
┌─────────▼────────────────▼───────────────▼──────────────▼────────┐
│                      FASTIFY SERVER (:3002)                       │
│                                                                   │
│  ┌──────────┐  ┌───────────────┐  ┌──────────────────────────┐  │
│  │ REST API │  │ Socket.io     │  │ Game Engine              │  │
│  │ Routes   │  │ Handlers      │  │ (State Machine, Scoring, │  │
│  │          │  │               │  │  Timers, Knockout)       │  │
│  └────┬─────┘  └───────┬───────┘  └────────────┬─────────────┘  │
│       │                │                        │                 │
│  ┌────▼────────────────▼────────────────────────▼─────────────┐  │
│  │                   Service Layer                             │  │
│  │  (quizService, sessionService, questionService, etc.)       │  │
│  └────────────┬──────────────────────────┬─────────────────────┘  │
│               │                          │                        │
│  ┌────────────▼──────────┐  ┌────────────▼──────────────────┐    │
│  │  MySQL (Sequelize)    │  │  Redis / In-Memory Store      │    │
│  │  Persistent data      │  │  Live game state, timers,     │    │
│  │                       │  │  lobby, responses              │    │
│  └───────────────────────┘  └───────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
showdown_trivia/
├── client/                          # Next.js frontend
│   ├── app/
│   │   ├── admin/                   # Admin panel (JWT-protected, role: admin)
│   │   │   ├── login/page.tsx       # Admin login
│   │   │   ├── quizzes/             # Quiz CRUD
│   │   │   ├── questions/           # Question bank
│   │   │   ├── sessions/            # Session management
│   │   │   ├── media/               # Media library
│   │   │   └── layout.tsx           # Sidebar + auth guard
│   │   ├── host/                    # Host control panel (JWT-protected, role: host)
│   │   │   ├── login/page.tsx       # Host login
│   │   │   ├── dashboard/page.tsx   # Live game control
│   │   │   ├── sessions/page.tsx    # Session picker
│   │   │   ├── teams/page.tsx       # Team management
│   │   │   └── layout.tsx           # Header + auth guard
│   │   ├── play/                    # Player mobile interface (no auth)
│   │   │   ├── join/page.tsx        # PIN entry
│   │   │   ├── lobby/page.tsx       # Waiting room
│   │   │   ├── game/page.tsx        # Active gameplay
│   │   │   ├── mini-game/page.tsx   # Unity WebGL games
│   │   │   └── layout.tsx           # Session context + reconnect
│   │   ├── venue/                   # Venue display screen (no auth)
│   │   │   ├── display/page.tsx     # Full-screen display
│   │   │   └── layout.tsx
│   │   ├── layout.tsx               # Root layout
│   │   └── providers.tsx            # AuthProvider wrapper
│   ├── components/
│   │   ├── shared/                  # Button, Modal, LoadingSpinner, QRCode, Timer
│   │   └── mini-games/              # UnityWrapper, DynamicUnityGame
│   ├── hooks/
│   │   ├── useSocket.ts             # Singleton Socket.io client
│   │   ├── useReconnect.ts          # Auto-reconnection logic
│   │   ├── useAudio.ts              # Web Audio API MP3 playback
│   │   ├── useTimerSound.ts         # Synthesized tick/buzz sounds
│   │   ├── useKeyboardShortcuts.ts  # Host keyboard controls
│   │   ├── useTimer.ts              # Client-side timer hook
│   │   └── useGameState.ts          # Game state management
│   └── lib/
│       ├── api.ts                   # REST fetch wrapper (auto-attaches JWT)
│       ├── auth.tsx                 # AuthProvider context, useAuth hook
│       ├── socket.ts                # Socket.io singleton
│       └── utils.ts                 # cn() classname utility
│
├── server/                          # Fastify backend
│   └── src/
│       ├── config/
│       │   ├── database.js          # Sequelize MySQL config
│       │   ├── env.js               # Zod-validated environment variables
│       │   └── redis.js             # ioredis client with fallback
│       ├── middleware/
│       │   ├── authMiddleware.js     # JWT verify, requireAdmin, requireHost
│       │   ├── errorHandler.js       # Global Fastify error handler
│       │   ├── socketGuard.js        # Socket event validation
│       │   └── validateRequest.js    # Zod body/params validation
│       ├── models/
│       │   ├── Quiz.js              # Quiz entity
│       │   ├── Round.js             # Round (belongs to Quiz)
│       │   ├── Question.js          # Question (belongs to Round)
│       │   ├── Session.js           # Game session (PIN, status, hostToken)
│       │   ├── Team.js              # Team (belongs to Session)
│       │   ├── Answer.js            # Answer record
│       │   └── index.js             # Model loader + associations
│       ├── routes/
│       │   ├── authRoutes.js         # POST /api/auth/login, GET /api/auth/me
│       │   ├── quizRoutes.js         # CRUD /api/quizzes (admin only)
│       │   ├── questionRoutes.js     # CRUD /api/questions (admin only)
│       │   ├── roundRoutes.js        # GET /api/rounds (admin only)
│       │   ├── mediaRoutes.js        # Upload/list /api/media (admin only)
│       │   ├── sessionRoutes.js      # CRUD /api/sessions (admin + host)
│       │   └── teamRoutes.js         # /api/teams (admin + host)
│       ├── services/
│       │   ├── quizService.js
│       │   ├── questionService.js
│       │   ├── sessionService.js
│       │   ├── teamService.js
│       │   ├── mediaService.js
│       │   ├── redisSessionStore.js  # Redis helpers with in-memory fallback
│       │   └── game-engine/
│       │       ├── gameController.js  # Central orchestrator
│       │       ├── stateMachine.js    # Game state transitions
│       │       ├── scoringEngine.js   # Score calculation per round type
│       │       ├── knockoutEngine.js  # Elimination round logic
│       │       ├── timerManager.js    # Countdown timer management
│       │       └── roundHandlers/     # Per-round-type scoring logic
│       │           ├── multipleChoice.js
│       │           ├── wager.js
│       │           ├── music.js
│       │           ├── elimination.js
│       │           ├── majorityRules.js
│       │           ├── finalMultipleChoice.js
│       │           └── finalWager.js
│       ├── socket/
│       │   ├── index.js              # Socket.io server init
│       │   ├── hostHandlers.js       # Host events (start, next, reveal, etc.)
│       │   ├── playerHandlers.js     # Player events (join, answer, leave)
│       │   ├── venueHandlers.js      # Venue + host reconnection
│       │   └── miniGameHandlers.js   # Unity game events
│       └── utils/
│           ├── logger.js             # Winston logger
│           ├── responseWrapper.js    # success() / error() helpers
│           ├── pinGenerator.js       # 6-digit PIN generator
│           ├── qrGenerator.js        # QR code generation
│           └── tokenGenerator.js     # Host token generator
│
├── shared/                          # Shared between client and server
│   ├── constants/
│   │   ├── gameStates.js            # LOBBY, ROUND_INTRO, QUESTION, etc.
│   │   ├── questionStates.js        # WAITING, ACTIVE, REVEALED
│   │   ├── roundTypes.js            # MULTIPLE_CHOICE, WAGER, MUSIC, etc.
│   │   ├── scoring.js               # Scoring constants
│   │   └── socketEvents.js          # All Socket.io event names
│   ├── schemas/
│   │   ├── quiz.js                  # Zod validation schemas
│   │   ├── question.js
│   │   ├── session.js
│   │   ├── team.js
│   │   └── answer.js
│   └── types/
│       └── index.ts                 # Shared TypeScript types
│
└── .env                             # Environment configuration
```

## Data Model

```
┌──────────┐     ┌──────────┐     ┌────────────┐
│  Quiz    │────▶│  Round   │────▶│  Question  │
│          │ 1:N │          │ 1:N │            │
│ id       │     │ id       │     │ id         │
│ title    │     │ name     │     │ text       │
│ desc     │     │ type     │     │ options[]  │
└──────────┘     │ order    │     │ mediaUrl   │
                 │ timer    │     │ mediaType  │
                 └──────────┘     │ timer      │
                                  └────────────┘

┌──────────┐     ┌──────────┐     ┌────────────┐
│ Session  │────▶│  Team    │────▶│  Answer    │
│          │ 1:N │          │ 1:N │            │
│ id       │     │ id       │     │ id         │
│ pin      │     │ teamName │     │ questionId │
│ quizId   │     │ score    │     │ response   │
│ hostToken│     │ isConn.  │     │ isCorrect  │
│ status   │     │ isElim.  │     │ points     │
│ qrCode   │     │ socketId │     └────────────┘
└──────────┘     └──────────┘
```

## Authentication Flow

```
Admin/Host → Login Page → POST /api/auth/login → JWT token
                                                    │
                                     ┌──────────────▼───────────────┐
                                     │ localStorage: auth_token     │
                                     │ localStorage: auth_role      │
                                     └──────────────┬───────────────┘
                                                    │
                              Every API request: Authorization: Bearer <token>
                                                    │
                                     ┌──────────────▼───────────────┐
                                     │ Server: verifyToken()        │
                                     │ → requireAdmin()             │
                                     │ → requireAdminOrHost()       │
                                     └──────────────────────────────┘
```

- Admin credentials: hardcoded in `.env` (ADMIN_EMAIL, ADMIN_PASSWORD)
- Host credentials: hardcoded in `.env` (HOST_EMAIL, HOST_PASSWORD)
- Player/Venue: no authentication (join via 6-digit PIN)

## Real-Time Communication

All live game events flow through Socket.io:

```
Host Dashboard                    Server                     Player / Venue
     │                              │                              │
     │── start_game ───────────────▶│                              │
     │                              │──── round_intro ────────────▶│
     │── next_question ────────────▶│                              │
     │                              │──── question_active ────────▶│
     │── start_timer ──────────────▶│                              │
     │                              │──── timer_update ───────────▶│
     │                              │──── timer_expired ──────────▶│
     │                              │                              │
     │                              │◀─── submit_answer ───────────│
     │                              │──── response_count ─────────▶│
     │── reveal_answer ────────────▶│                              │
     │                              │──── answer_reveal ──────────▶│
     │── show_scoreboard ──────────▶│                              │
     │                              │──── scoreboard ─────────────▶│
     │── advance_round ────────────▶│                              │
     │── end_game ─────────────────▶│                              │
     │                              │──── game_end ───────────────▶│
```

## Game Engine

The server-side game engine uses a **state machine** pattern:

```
LOBBY → ROUND_INTRO → QUESTION → ANSWER_REVEAL → SCOREBOARD → ROUND_INTRO (next)
                                                                    │
                                                          (no more rounds)
                                                                    ▼
                                                             FINAL_RESULTS
```

Additional states: `BREAK`, `MINI_GAME`

### Round Types (7)

| Round | Type                  | Scoring                                          |
| ----- | --------------------- | ------------------------------------------------ |
| 1     | MULTIPLE_CHOICE       | +2 correct, -1 wrong                             |
| 2     | WAGER                 | +/- wagered amount                               |
| 3     | MUSIC                 | +2 correct, -1 wrong                             |
| 4     | ELIMINATION           | +2 correct, eliminated if wrong (all-wrong rule) |
| 5     | MAJORITY_RULES        | Points = teams who chose the same answer         |
| 6     | FINAL_MULTIPLE_CHOICE | +3 correct, -1 wrong                             |
| 7     | FINAL_WAGER           | +/- wagered amount                               |

### Live State Storage (Redis)

| Key Pattern                     | Data                                               |
| ------------------------------- | -------------------------------------------------- |
| `game:{pin}:session`          | Session ID reference                               |
| `game:{pin}:gameState`        | Full game state (rounds, scores, current question) |
| `game:{pin}:lobby`            | Teams in lobby (hash)                              |
| `game:{pin}:teams`            | Team data with scores (hash)                       |
| `game:{pin}:responses:{qIdx}` | Player responses per question                      |

Falls back to an in-memory `Map` when Redis is unavailable.

## API Routes

| Method                                                                                                                         | Route                                                                                                                          | Auth       | Description           |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------- |
| POST                                                                                                                           | /api/auth/login                                                                                                                | Public     | Login (admin or host) |
| GET                                                                                                                            | /api/auth/me                                                                                                                   | Bearer     | Validate token        |
| GET/POST/PUT/DELETE                                                                                                            | /api/quizzes                                                                                                                   | Admin      | Quiz CRUD             |
| GET/POST/PUT/DELETE                                                                                                            | /api/questions                                                                                                                 | Admin      | Question CRUD         |
| Implement this design from Figma.@https://www.figma.com/design/JoPgI2aw16JXEohkaBYDQ4/Max-Showdown-Dev?node-id=232-2610&m=dev | Implement this design from Figma.@https://www.figma.com/design/JoPgI2aw16JXEohkaBYDQ4/Max-Showdown-Dev?node-id=232-2610&m=dev | Admin      | Round listing         |
| POST/GET/DELETE                                                                                                                | /api/media                                                                                                                     | Admin      | File upload/list      |
| GET/POST                                                                                                                       | /api/sessions                                                                                                                  | Admin+Host | Session management    |
| POST                                                                                                                           | /api/sessions/:id/end                                                                                                          | Admin+Host | End a session         |
| GET                                                                                                                            | /api/sessions/:id/results                                                                                                      | Admin+Host | Session results       |
| GET/POST/PUT/DELETE                                                                                                            | /api/teams                                                                                                                     | Admin+Host | Team management       |

## Deployment Notes

- **Server**: Fastify on port 3002, Socket.io on same port
- **Client**: Next.js on port 3000
- **Database**: MySQL on port 3306
- **Redis**: port 6379 (optional for dev)
- **Sticky sessions** required for Socket.io in multi-instance deployments
- **CORS** enabled for cross-origin requests
- **File uploads** stored in `./uploads` directory (configurable via UPLOAD_DIR)
