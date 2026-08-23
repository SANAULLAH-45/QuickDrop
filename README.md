# QuickDrop

**Share anything. No login. No app.**

QuickDrop is a temporary, code-based text and file sharing tool. One person creates a room and gets a 6-character code; anyone with that code can join and instantly exchange text messages and files in real time. No accounts, no installs, and every room self-destructs after 15 minutes.

---

## 1. Features

- Create a room and get a secure, randomly generated 6-character code + QR code
- Join a room by typing a code, scanning the QR code, or pasting a link
- Real-time text messaging (Socket.IO), with copy-to-clipboard
- Drag-and-drop or click-to-browse file uploads, with live progress bars
- File download, with filename/size/type shown for every shared file
- Live "is the other person connected?" indicator
- Countdown timer that turns amber, then red, as a room approaches expiry
- Rooms and their files are **automatically and permanently deleted** after expiry (default 15 minutes) or when manually removed
- Dark / light theme toggle (defaults to dark)
- Fully responsive, mobile-first UI with toasts, empty states, and error states
- Rate limiting, filename sanitization, executable-file blocking, and other production-minded security defaults

---

## 2. Tech Stack

| Layer      | Technology |
|------------|------------|
| Frontend   | Vanilla HTML, CSS, JavaScript (no framework/build step) |
| Backend    | Node.js, Express.js |
| Real-time  | Socket.IO |
| File uploads | Multer |
| Security   | Helmet, express-rate-limit, CORS |

---

## 3. Project Structure

```
quickdrop/
├── client/                    # Static frontend (served by Express)
│   ├── index.html             # Single HTML shell + <template>s for every screen
│   ├── css/
│   │   └── style.css          # Design system + all component styles
│   ├── js/
│   │   ├── utils.js           # Formatting/helper functions
│   │   ├── toast.js           # Toast notifications
│   │   ├── theme.js           # Dark/light theme toggle
│   │   ├── api.js             # REST API client (fetch/XHR)
│   │   ├── socket.js          # Socket.IO client wrapper
│   │   ├── room.js            # Room screen controller (the core UI logic)
│   │   ├── router.js          # Hash-based client-side router
│   │   └── app.js             # Home/Create/Join screen glue + bootstrap
│   └── assets/
│       └── favicon.svg
│
├── server/
│   ├── server.js               # App entry point: Express + Socket.IO wiring
│   ├── routes/
│   │   └── rooms.js            # REST route definitions
│   ├── controllers/
│   │   └── roomController.js   # REST request handlers
│   ├── middleware/
│   │   ├── upload.js           # Multer configuration
│   │   ├── rateLimiter.js      # express-rate-limit configs
│   │   └── errorHandler.js     # Centralized error handling
│   ├── services/
│   │   ├── roomService.js      # In-memory room store + business logic
│   │   ├── socketHandler.js    # All Socket.IO event handlers
│   │   └── cleanupService.js   # Background sweep that expires rooms
│   └── utils/
│       ├── codeGenerator.js    # Secure room code / ID generation
│       └── fileValidator.js    # Filename sanitization + type validation
│
├── uploads/                    # Temporary file storage (gitignored, auto-created)
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## 4. Getting Started (Local Development)

### Prerequisites
- Node.js 18 or later
- npm 9 or later

### Install

```bash
cd quickdrop
npm install
```

### Configure environment variables

```bash
cp .env.example .env
```

Then edit `.env` if you want to change the defaults:

```
PORT=3000
CLIENT_URL=http://localhost:3000
MAX_FILE_SIZE_MB=50
ROOM_EXPIRY_MINUTES=15
MAX_ROOM_USERS=2
NODE_ENV=development
```

### Run in development (auto-restarts on file changes)

```bash
npm run dev
```

### Run in production mode

```bash
npm start
```

Then open **http://localhost:3000** in your browser. Open it in a second tab (or another device on the same network, using your machine's local IP) to simulate a second participant and test file/text sharing end to end.

---

## 5. How the Architecture Works

**One server, two communication channels.**

- **REST API** (`/api/rooms/...`) handles anything transactional: creating a room, checking whether a code is valid, uploading a file (via `multipart/form-data` + Multer), and downloading a file. These map cleanly to HTTP semantics (`POST`, `GET`, `DELETE`) and don't need to be "real-time."
- **Socket.IO** handles anything that needs to be pushed instantly to the other participant: text messages, "someone joined/left," and "a file just became available." Every socket connection joins a Socket.IO room named after the 6-character code, so `io.to(code).emit(...)` reaches exactly the people in that share — and no one else.

**Room state lives in memory**, in a single `Map` inside `roomService.js`. There is deliberately no database: rooms are inherently ephemeral, contain no user accounts, and should leave no persistent trace. A background interval (`cleanupService.js`) sweeps every 30 seconds, deletes any room whose `expiresAt` has passed, removes its files from disk, and emits a `room:expired` event so any open browser tab immediately shows the "Room Expired" screen instead of silently failing.

**The frontend is a single-page app with no build step.** `router.js` is a tiny hash-based router (`#/`, `#/create`, `#/join`, `#/room/ABC123`, `#/expired`) that swaps `<template>` contents into `#app`. Each screen has its own controller module (`app.js` for Home/Create/Join, `room.js` for the room screen itself), keeping the code modular without needing a frontend framework or bundler.

---

## 6. How Text and Files Are Transferred

### Text
1. The sender types a message and submits the form.
2. The client emits a `message:send` Socket.IO event with `{ code, text }`.
3. The server validates the sender is actually a member of that room, rate-limits per-socket message bursts, trims/length-checks the text, stores it in the room's in-memory `messages` array, and broadcasts `message:receive` to everyone in that Socket.IO room (including the sender, so all tabs stay in sync).
4. Every connected client appends the message to its message list in real time.

### Files
1. The sender selects or drags a file. The client checks it against the configured max size before doing anything else.
2. The file is uploaded via `XMLHttpRequest` (not `fetch`, specifically so upload **progress events** are available) as `multipart/form-data` to `POST /api/rooms/:code/files`.
3. **Multer** streams the file to disk under `uploads/`, renaming it to a random hex string (never the original filename) and rejecting anything on the blocked-extension list (executables, scripts, installers) before it's fully written.
4. The server records file metadata (safe display name, size, MIME type, a random file ID) in the room's `files` array and emits a `file:available` Socket.IO event to the whole room.
5. Every connected client — sender included — renders the file in the file list. Anyone can click **Download**, which hits `GET /api/rooms/:code/files/:fileId` and streams the file back with its original (sanitized) filename.
6. Files can be removed early via the trash icon (`DELETE /api/rooms/:code/files/:fileId`), or are deleted automatically — from both the room's file list and disk — the moment the room expires.

---

## 7. API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/rooms` | Create a new room. Returns `{ code, createdAt, expiresAt, expiryMinutes }`. |
| `GET` | `/api/rooms/:code` | Validate a room code and fetch its current state (messages + files). `404` if missing/expired. |
| `POST` | `/api/rooms/:code/files` | Upload a file (`multipart/form-data`, field name `file`). |
| `GET` | `/api/rooms/:code/files/:fileId` | Download a previously uploaded file. |
| `DELETE` | `/api/rooms/:code/files/:fileId` | Remove a file from the room and delete it from disk. |
| `GET` | `/api/config` | Returns client-relevant runtime limits (max file size, expiry minutes). |
| `GET` | `/api/health` | Basic liveness check. |

### Socket.IO Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `room:join` | client → server (ack) | `{ code, role }` → `{ ok, room, socketId }` |
| `room:leave` | client → server | `{ code }` |
| `room:user-joined` | server → clients | `{ connectedUsers }` |
| `room:user-left` | server → clients | `{ connectedUsers }` |
| `message:send` | client → server (ack) | `{ code, text }` → `{ ok, message }` |
| `message:receive` | server → clients | `{ id, text, senderId, timestamp }` |
| `file:available` | server → clients | file metadata + `senderId` |
| `file:deleted` | server → clients | `{ fileId }` |
| `room:expired` | server → clients | `{ code }` |

---

## 8. Security Notes

- Room codes are generated with `crypto.randomBytes`, not `Math.random()`.
- Uploaded files are stored on disk under a random name — the original filename is never used as a path, which rules out path traversal.
- A denylist blocks common executable/script extensions (`.exe`, `.sh`, `.bat`, `.js`, `.jar`, `.dll`, etc.) regardless of declared MIME type.
- Filenames are sanitized (control characters stripped, `path.basename` applied) before being shown or used in a `Content-Disposition` download header.
- `express-rate-limit` throttles room creation, room lookups, and uploads separately.
- `helmet` sets standard security headers and a Content-Security-Policy.
- No accounts, passwords, emails, or other personal data are ever collected or stored.
- All room data — messages, file metadata, and the files themselves — is held only in memory/disk and is wiped on expiry or server restart. Nothing is written to a database.

---

## 9. Deployment

QuickDrop is a single Node.js process serving both the API and the static frontend, which makes it straightforward to deploy anywhere that runs Node:

### Recommended architecture
```
[ Browser ] → HTTPS → [ Reverse proxy / TLS termination (e.g. Nginx, or your PaaS's built-in proxy) ] → [ Node.js process (this app) ]
```

- Terminate TLS in front of the app (via your platform, e.g. Render/Railway/Fly.io/Heroku-style PaaS, or your own Nginx/Caddy).
- Ensure WebSocket upgrade requests are proxied through (Socket.IO needs this) — most modern platforms and Nginx (with `proxy_set_header Upgrade $http_upgrade;`) handle this by default.
- Set environment variables (`PORT`, `CLIENT_URL`, `MAX_FILE_SIZE_MB`, `ROOM_EXPIRY_MINUTES`, `NODE_ENV=production`) in your platform's dashboard/secrets manager rather than committing a `.env` file.
- The `uploads/` directory needs to be **writable** at runtime. On platforms with ephemeral/read-only filesystems, mount a writable volume, or note that since files are temporary anyway, an ephemeral disk is often perfectly acceptable for this use case.
- If you run multiple server instances behind a load balancer, note that room state is currently in-memory per process — you'd need sticky sessions (so a client's REST + Socket.IO traffic hits the same instance) for multi-instance deployments to work correctly.

### Example: generic VM / Docker-style deploy
```bash
git clone <your-repo>
cd quickdrop
npm ci --omit=dev
cp .env.example .env   # edit values for production
NODE_ENV=production npm start
```

Put this behind Nginx or Caddy for TLS, or run it directly on a platform that provides HTTPS for you.

### Example minimal Dockerfile (not included by default, add if you use containers)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p uploads
EXPOSE 3000
CMD ["node", "server/server.js"]
```

---

## 10. Configuration Reference

| Variable | Default | Description |
|----------|---------|--------------|
| `PORT` | `3000` | Port the server listens on |
| `CLIENT_URL` | `http://localhost:3000` | Allowed CORS origin in production |
| `MAX_FILE_SIZE_MB` | `50` | Maximum size per uploaded file |
| `ROOM_EXPIRY_MINUTES` | `15` | Minutes before a room and its data are deleted |
| `MAX_ROOM_USERS` | `2` | Maximum simultaneous participants per room |
| `NODE_ENV` | `development` | `development` or `production` |

---

## 11. Known Limitations

- Room/message/file state is in-memory only — restarting the server clears all active rooms. This is intentional (nothing should persist), but means it doesn't survive a deploy/restart mid-share.
- Designed for two participants per room by default (`MAX_ROOM_USERS`), matching the "share with one other person" use case — adjustable via env var if you want small-group rooms.
- Single-process/in-memory design means horizontal scaling requires sticky sessions or a shared state layer (e.g. Redis + the Socket.IO Redis adapter) — not included here to keep the reference implementation simple.
