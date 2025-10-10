// server.js — מטעין Express + Socket.IO ואת כל ה-handlers המפורקים

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const corsMiddleware = require('./core/cors');
const { ALLOWED_ORIGINS, PORT } = require('./config/config');
const { players } = require('./core/players');
const attachSockets = require('./sockets');

const app = express();
const server = http.createServer(app);

// CORS ל-HTTP
app.use(corsMiddleware);

// Health
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Touch World Realtime Server is running.',
    connected_players_count: Object.keys(players).length,
    connected_players_ids: Object.keys(players)
  });
});

// Socket.IO
const io = new Server(server, {
  path: '/socket.io',
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      return ALLOWED_ORIGINS.includes(origin)
        ? cb(null, true)
        : cb(new Error('CORS blocked: ' + origin));
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: false
});

// חיבור כל ה-handlers
attachSockets(io);

// Start
server.listen(PORT, () => {
  console.log(`Touch World server listening on port ${PORT}`);
});
