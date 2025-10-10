// server.js — Express + Socket.IO (מודולרי)

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const { allowedOrigins } = require('./config/config');
const { buildCorsMiddleware } = require('./core/cors');
const players = require('./core/players');
const attachSocketHandlers = require('./sockets');

const app = express();
const server = http.createServer(app);

// CORS ל-HTTP
app.use(buildCorsMiddleware(cors, allowedOrigins));

// Health
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Touch World Realtime Server is running.',
    connected_players_count: Object.keys(players.store).length,
    connected_players_ids: Object.keys(players.store),
  });
});

// Socket.IO
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
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowEIO3: false,
});

// חיבור כל ההנדלרים
attachSocketHandlers(io);

// הפעלה
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Touch World server listening on port ${PORT}`);
});
