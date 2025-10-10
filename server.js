// server.js  —  Node + Socket.IO בלבד, בלי JSX/React
const http = require('http');
const { Server } = require('socket.io');
const express = require('express');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// שים לב: בלי סלאש בסוף הדומיין
const allowedOrigins = [
  'https://touch-world.io',
  'http://localhost:5173',
  'http://localhost:8081'
];

app.use(cors({
  origin: function (origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS blocked: ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS']
}));

const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error('CORS blocked: ' + origin));
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  // מומלץ לאלץ WebSocket אם אפשר:
  transports: ['websocket', 'polling'],
  allowEIO3: false
});

// state בזיכרון — הפשוט ביותר
const players = {};

// Health check
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Touch World Realtime Server is running.',
    connected_players_count: Object.keys(players).length,
    connected_players_ids: Object.keys(players),
  });
});

io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  // צור שחקן
  players[socket.id] = {
    id: socket.id,
    position_x: 600,
    position_y: 400,
    direction: 'front',
    animation_frame: 'idle',
    is_moving: false,
  };

  // שלח לרוכב החדש את כולם
  socket.emit('current_players', players);
  // עדכן את השאר על החדש
  socket.broadcast.emit('player_joined', players[socket.id]);

  // עדכון תנועה
  socket.on('player_update', (playerData) => {
    if (players[socket.id]) {
      players[socket.id] = { ...players[socket.id], ...playerData };
      socket.broadcast.emit('player_moved', players[socket.id]);
    }
  });

  // צ'אט
  socket.on('chat_message', (chatData) => {
    // לוג טקסטואלי בלבד בשרת
    console.log(`[CHAT] ${chatData.username}: ${chatData.message}`);
    io.emit('new_chat_message', {
      playerId: socket.id,
      message: chatData.message,
      username: chatData.username,
      adminLevel: chatData.adminLevel,
      timestamp: Date.now(),
    });
  });

  // מסחר
  socket.on('trade_request', (data) => {
    console.log(`[TRADE] Request from ${data.initiatorId} to ${data.receiverId}`);
    io.to(data.receiverId).emit('trade_request_received', data);
  });

  socket.on('trade_update', (data) => {
    console.log(`[TRADE] Update for trade ${data.tradeId}, status: ${data.status}`);
    const trade = data.tradeDetails;
    if (trade) {
      const otherPlayerId = socket.id === trade.initiator_id ? trade.receiver_id : trade.initiator_id;
      io.to(otherPlayerId).emit('trade_status_updated', data);
    }
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
