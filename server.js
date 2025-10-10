const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// הגדרת כתובות מורשות להתחבר לשרת
const allowedOrigins = [
  "https://touch-world.io", // הדומיין הרשמי של המשחק
  "http://localhost:5173", // כתובת לפיתוח מקומי
  "http://localhost:8081"
];

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true // הוספה קריטית לאימות
  }
});

const players = {};

// נתיב לבדיקת תקינות השרת (Health Check)
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Touch World Realtime Server is running.',
    connected_players_count: Object.keys(players).length,
    connected_players_ids: Object.keys(players)
  });
});

// לוגיקת ה-Socket.IO המרכזית
io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  players[socket.id] = {
    id: socket.id,
    position_x: 600,
    position_y: 400,
    direction: 'front',
    animation_frame: 'idle',
    is_moving: false,
  };

  socket.emit('current_players', players);
  socket.broadcast.emit('player_joined', players[socket.id]);

  socket.on('player_move', (movementData) => {
    if (players[socket.id]) {
      players[socket.id] = { ...players[socket.id], ...movementData };
      socket.broadcast.emit('player_moved', players[socket.id]);
    }
  });

  socket.on('chat_message', (chatData) => {
    const messagePayload = {
      playerId: socket.id,
      message: chatData.message,
      username: chatData.username,
      adminLevel: chatData.adminLevel,
      timestamp: Date.now()
    };
    io.emit('new_chat_message', messagePayload);
  });

  socket.on('disconnect', () => {
    console.log(`[-] Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('player_disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Touch World server listening on port ${PORT}`);
});
