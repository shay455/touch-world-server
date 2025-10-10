// server.js — Express + Socket.IO (מודול ראשי שמחבר הכל)

const http = require('http');
const express = require('express');
const cors = require('./core/cors');
const { Server } = require('socket.io');
const { allowedOrigins, PORT, SOCKET_PATH } = require('./config/config');
const { players, createDefaultPlayer, safePlayerView, mergeRuntimeUpdate } = require('./core/players');

// יצירת אפליקציה
const app = express();
const server = http.createServer(app);

// הפעלת CORS
app.use(cors);

// Health Check
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Touch World Server is running ✅',
    connected_players_count: Object.keys(players).length,
  });
});

// הגדרת Socket.IO
const io = new Server(server, {
  path: SOCKET_PATH,
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
});

// טעינת כל האירועים (handlers)
require('./sockets')(io, players, createDefaultPlayer, safePlayerView, mergeRuntimeUpdate);

// הפעלת השרת
server.listen(PORT, () => {
  console.log(`🌍 Touch World server running on port ${PORT}`);
});
