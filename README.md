# Real-Time Collaborative Whiteboard

A production-grade **Real-Time Collaborative Whiteboard** built as a developer portfolio project.

---

## 📌 Current Phase

**Phase 9 — Advanced Collaboration, Board History & Audit Trail**

*Note: Phase 9 introduces immutable event history (`BoardEvent`), periodic automated state snapshotting (`BoardSnapshot`), deterministic historical state reconstruction at any target version via snapshot + event replay, paginated REST audit log queries (`GET /boards/:roomId/history`), state reconstruction API (`GET /boards/:roomId/history/:version`), and an interactive read-only frontend History modal with version navigation and user metadata display.*


---

## 🛠️ Tech Stack

### Frontend (`apps/web`)
- **Framework:** [Next.js](https://nextjs.org/) (App Router, React 18)
- **Language:** [TypeScript](https://www.typescriptlang.org/) (Strict Mode)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Canvas Engine:** HTML5 Canvas API & Pointer Events API
- **Auth & Storage:** JWT authentication context (`AuthContext`), persistent login via `localStorage` (with server validation on load)
- **Real-Time Transport:** Native Browser WebSockets (`useWebSocket` hook & client manager)
- **Icons:** [Lucide React](https://lucide.dev/)

### Backend (`apps/server`)
- **Framework:** [NestJS](https://nestjs.com/) (`@nestjs/websockets`, `@nestjs/platform-ws`, `@nestjs/jwt`, `@nestjs/passport`)
- **Security:** Password hashing (`bcryptjs`), JWT validation, server-side RBAC guards
- **ORM & Database:** [Prisma ORM](https://www.prisma.io/) + [PostgreSQL](https://www.postgresql.org/)
- **Pub/Sub Broker:** [Redis](https://redis.io/) (`ioredis`)
- **Services:** `AuthService`, `BoardAccessService`, `WhiteboardGateway`, `RoomManager`, `PresenceManager`, `RedisService`, `BoardPersistenceService`, `PrismaService`
- **Endpoints:** `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`, `POST/GET /boards`, `GET/POST/DELETE /boards/:roomId/members`, `GET /health`

### Shared Package (`packages/shared`)
- Shared TypeScript interfaces (`AuthUser`, `AuthResponse`, `BoardRole`, `BoardSummary`, `BoardMemberDto`, `Point`, `Stroke`, `WsMessage`, `WsEventType`, `DistributedEvent`, `PresenceUser`)
- Schema validation utilities (`isValidWsMessage`, `isValidDistributedEvent`)

---

## 🔐 Authentication & Authorization Architecture

### Security Principles & Invariants
1. **Cryptographic Identity Verification:**
   - Password hashes are computed using `bcryptjs` with 10 salt rounds. Plaintext passwords are never stored, logged, or returned.
   - User identity is cryptographically signed using JWTs signed with `JWT_SECRET`.
   - Client-supplied `userId`, `displayName`, or `role` claims in WebSocket payloads are **ignored**. Authenticated identity is strictly derived on the server from validated JWT tokens.

2. **Role-Based Access Control (RBAC) Matrix:**
   | Action | OWNER | EDITOR | VIEWER |
   |---|:---:|:---:|:---:|
   | Read board / Join room | YES | YES | YES |
   | Draw (`stroke:add`) | YES | YES | NO |
   | Erase / Undo (`stroke:remove`) | YES | YES | NO |
   | Clear board (`board:clear`) | YES | NO | NO |
   | Manage board members | YES | NO | NO |
   | Delete board | YES | NO | NO |

3. **Server-Enforced WebSocket Permissions:**
   - The WebSocket gateway enforces permissions server-side.
   - If a `VIEWER` client attempts to send `stroke:add` or `stroke:remove`, the server rejects the action and replies with a `room:error` (`FORBIDDEN`) message.
   - If an `EDITOR` or `VIEWER` attempts to clear the board (`board:clear`), the action is rejected before updating memory or database.

4. **IDOR & Board Access Protection:**
   - On room join (`room:join`) or REST API calls (`GET /boards/:roomId`), the server queries database membership.
   - Non-members attempting to join or view an owned board are rejected with `403 Forbidden` (`room:error`), preventing unauthorized access by simply knowing a room ID.

5. **Legacy Anonymous Boards:**
   - Boards created without an `ownerId` (`ownerId === null`) retain backward-compatible open access as `EDITOR` for all users until explicitly claimed or migrated.

6. **JWT Secret Configuration:**
   - The server validates `JWT_SECRET`. In production mode (`NODE_ENV=production`), the server fails startup if `JWT_SECRET` is missing.

---

## 🔒 WebSocket Hardened Authentication Flow

To protect JWT tokens from leak risks via reverse-proxy logs, URL histories, load balancers, and browser history, sensitive tokens are **never** passed in WebSocket connection query parameters (e.g., `ws://localhost:3001?token=...`).

Instead, a strict **7-Step Handshake Protocol** is enforced:

1. **Establish Unauthenticated Transport:** Client connects to `ws://localhost:3001`. Connection is initialized in `isAuthenticated = false` state. An unref'd 10-second auth timer (`AUTH_TIMEOUT_MS`) is attached to the socket.
2. **Authentication Handshake:** Client immediately transmits an `auth:authenticate` payload containing `{ token: "<JWT>" }`.
3. **Cryptographic Verification:** Server verifies the token using NestJS `JwtService` against `JWT_SECRET`.
4. **Socket State Binding:** On successful verification, the server binds the resolved user identity (`id`, `email`, `displayName`) to the socket context, sets `isAuthenticated = true`, and cancels the 10-second timeout timer.
5. **Auth Success Confirmation:** Server returns an `auth:success` confirmation message containing the user identity payload back to the client.
6. **Room Join Authorization:** Client proceeds to send `room:join`. The server verifies room existence, checks database RBAC membership (`OWNER`, `EDITOR`, `VIEWER`), and rejects non-members with a `403 Forbidden` (`room:error`) message.
7. **Protected Event Execution:** All subsequent operations (`stroke:add`, `stroke:remove`, `board:clear`, `cursor:move`, `board:request-state`) require active socket authentication. Unauthenticated requests trigger immediate socket disconnection.

---

## ✨ System Architecture

```text
                    ┌─────────────────────┐
                    │     PostgreSQL      │
                    │   Users, Boards,    │
                    │   Members, Strokes  │
                    └──────────▲──────────┘
                               │
                             Prisma
                               │
             ┌─────────────────┴─────────────────┐
             │                                   │
      ┌──────┴──────┐                     ┌──────┴──────┐
      │   Server 1  │                     │   Server 2  │
      │    :3001    │                     │    :3002    │
      └──────┬──────┘                     └──────┬──────┘
             │                                   │
             └──────────── Redis Pub/Sub ─────────┘
                               │
                          WebSockets
                               │
                            Clients
```

---

## 🗄️ Database Schema (`apps/server/prisma/schema.prisma`)

```prisma
enum Role {
  OWNER
  EDITOR
  VIEWER
}

model User {
  id           String        @id @default(uuid())
  email        String        @unique
  passwordHash String
  displayName  String
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  ownedBoards  Board[]       @relation("BoardOwner")
  memberships  BoardMember[]

  @@map("users")
}

model Board {
  id        String        @id @default(uuid())
  roomId    String        @unique
  name      String?
  ownerId   String?
  version   Int           @default(0)
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  owner     User?         @relation("BoardOwner", fields: [ownerId], references: [id], onDelete: SetNull)
  members   BoardMember[]
  strokes   StrokeData[]

  @@map("boards")
}

model BoardMember {
  id        String   @id @default(uuid())
  boardId   String
  userId    String
  role      Role     @default(EDITOR)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  board     Board    @relation(fields: [boardId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([boardId, userId])
  @@map("board_members")
}

model StrokeData {
  id        String   @id @default(uuid())
  boardId   String
  strokeId  String   @unique
  data      Json
  createdAt DateTime @default(now())
  board     Board    @relation(fields: [boardId], references: [id], onDelete: Cascade)

  @@index([boardId])
  @@map("strokes")
}

model ProcessedEvent {
  id        String   @id @default(uuid())
  eventId   String   @unique
  roomId    String
  createdAt DateTime @default(now())

  @@index([roomId])
  @@map("processed_events")
}
```

---

## 🚀 Running Locally

### 1. Install Dependencies
```bash
npm install
```

### 2. Build Shared Package & Prisma Client
```bash
npm run build:shared
npm run prisma:generate --workspace=apps/server
```

### 3. Start Infrastructure Services (Redis + PostgreSQL)
```bash
docker compose up -d
```

### 4. Run Database Migrations
```bash
npm run prisma:migrate --workspace=apps/server
```

### 5. Start Development Servers

Start Next.js Frontend:
```bash
npm run dev:web
```
*Frontend runs at:* `http://localhost:3000`

Start NestJS Server:
```bash
npm run dev:server
```
*Backend runs at:* `http://localhost:3001` (WebSocket server at `ws://localhost:3001`)

### 6. Run Unit & Security Test Suite
```bash
npm run test
```

### 7. Run Type Checking & Linting
```bash
npm run lint
```

### 8. Production Build
```bash
npm run build
```

---

## 🗺️ Project Roadmap

- [x] **Phase 1 — Foundation + Single User Whiteboard**
- [x] **Phase 2 — WebSocket Real-Time Synchronization**
- [x] **Phase 3 — Rooms + Presence + Remote Cursors**
- [x] **Phase 4 — Redis Pub/Sub + Multi-Instance Gateway**
- [x] **Phase 5 — PostgreSQL + Prisma Board Persistence**
- [x] **Phase 6 — Authentication + Authorization** (JWT, Password Hashing, RBAC, IDOR Protection)
- [x] **Phase 7 — Collaboration Reliability & Synchronization** (Monotonic Board Versioning, DB Transactions, Event Idempotency, Gap Detection)
- [x] **Phase 8 — Docker + Production Cloud Deployment** (NGINX Proxy, Multi-container Docker Compose, Healthchecks)
- [x] **Phase 9 — Advanced Collaboration, Board History & Audit Trail** (Immutable Event History, Snapshots, Version State Reconstruction, Audit Log Modal)

