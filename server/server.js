require('dotenv').config();

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Server } = require('socket.io');

const roomsRouter = require('./routes/rooms');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { registerSocketHandlers } = require('./services/socketHandler');
const { startCleanupService } = require('./services/cleanupService');

const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL || `http://localhost:${PORT}`;
const NODE_ENV = process.env.NODE_ENV || 'development';

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const app = express();
const server = http.createServer(app);

// In development, allow any localhost origin so the client can be opened
// directly. In production, restrict to CLIENT_URL only.
const corsOptions = {
  origin: NODE_ENV === 'production' ? CLIENT_URL : true,
  methods: ['GET', 'POST', 'DELETE'],
  credentials: false
};

const io = new Server(server, {
  cors: corsOptions,
  maxHttpBufferSize: 1e6 // Socket.IO channel is for signaling only; files go over REST/multer.
});

// Make io available to REST controllers (e.g. to emit file:available).
app.set('io', io);

// --- Security & core middleware -------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.socket.io"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Never expose server filesystem structure via directory listing.
app.use(express.static(path.join(__dirname, '..', 'client'), { index: 'index.html', dotfiles: 'ignore' }));

// --- API routes -------------------------------------------------------------
app.use('/api/rooms', roomsRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Exposes the small set of runtime limits the client UI needs to display
// (e.g. "Max 50MB per file"). No secrets or internal paths are included.
app.get('/api/config', (req, res) => {
  res.json({
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10),
    roomExpiryMinutes: parseInt(process.env.ROOM_EXPIRY_MINUTES || '15', 10),
    maxRoomUsers: parseInt(process.env.MAX_ROOM_USERS || '2', 10)
  });
});

// Any unmatched /api/* route -> 404 JSON
app.use('/api', notFoundHandler);

// Client-side routing fallback: serve index.html for any other GET route
// (Home / Create / Join / Room screens are all handled client-side).
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.use(errorHandler);

// --- Socket.IO ---------------------------------------------------------------
registerSocketHandlers(io);

// --- Background cleanup -------------------------------------------------------
startCleanupService(io);

server.listen(PORT, () => {
  console.log(`QuickDrop server running on http://localhost:${PORT} [${NODE_ENV}]`);
});

module.exports = { app, server, io };
