// server.js — Express + Socket.IO (מטעין Handlers מפורקים)

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

// ───── CORS ─────
const allowedOrigins = [
  'https://touch-world-server.onrender.com',
  'https://touch-world.io',
  'http://localhost:5173',
  'http://localhost:8081'
];

const app = express();
const server = http.createServer(app);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    return allowedOrigins.includes(origin)
      ? cb(null, true)
      : cb(new Error('CORS blocked: ' + origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));

// Health
app.get('/', (req, res) => {
  const { players } = require('./src/state/players');
  res.status(200).json({
    status: 'ok',
    message: 'Touch World Realtime Server is running.',
    connected_players_count: Object.keys(players).length,
    connected_players_ids: Object.keys(players)
  });
});

// ───── Socket.IO ─────
const io = new Server(server, {
  path: '/socket.io',
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      return allowedOrigins.includes(origin)
        ? cb(null, true)
        : cb(new Error('CORS blocked: ' + origin));
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: false
});

// טעינת ה-handlers
const { onConnection } = require('./src/handlers/onConnection');
io.on('connection', (socket) => onConnection(io, socket));

// Start
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Touch World server listening on port ${PORT}`);
});
