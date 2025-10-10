// server.js — Express + Socket.IO (Node, בלי JSX)

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// IMPORTANT: בלי סלאש בסוף! כך ה-Origin מגיע מהדפדפן.
const allowedOrigins = [
  'https://touch-world-server.onrender.com',
  'https://touch-world.io',
  'http://localhost:5173',
  'http://localhost:8081'
];

// CORS עבור HTTP (כולל health)
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // מאפשר כלים בלי Origin (מובייל/בדיקות)
    return allowedOrigins.includes(origin)
      ? cb(null, true)
      : cb(new Error('CORS blocked: ' + origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));

// Store בזיכרון עבור שחקנים
const players = Object.create(null);

// Health check
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Touch World Realtime Server is running.',
    connected_players_count: Object.keys(players).length,
    connected_players_ids: Object.keys(players)
  });
});

// הגדרת Socket.IO
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
  transports: ['websocket', 'polling'], // מתחיל ב-WS, נופל לפולינג אם צריך
  allowEIO3: false
});

// חיבורי realtime
io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  // יצירת שחקן ברירת מחדל
  players[socket.id] = {
    id: socket.id,
    position_x: 600,
    position_y: 400,
    direction: 'front',
    animation_frame: 'idle',
    is_moving: false
  };

  // שלח למתחבר החדש את כל השחקנים
  socket.emit('current_players', players);

  // עדכן את השאר על שחקן חדש
  socket.broadcast.emit('player_joined', players[socket.id]);

  // עדכוני מצב/תנועה
  socket.on('player_update', (playerData = {}) => {
    if (!players[socket.id]) return;
    players[socket.id] = { ...players[socket.id], ...playerData };
    socket.broadcast.emit('player_moved', players[socket.id]);
  });

  // צ'אט
  socket.on('chat_message', (chatData = {}) => {
    const username = chatData.username || 'Unknown';
    const message  = chatData.message  || '';
    console.log(`[CHAT] ${username}: ${message}`);

    io.emit('new_chat_message', {
      playerId: socket.id,
      message,
      username,
      adminLevel: chatData.adminLevel || 'user',
      timestamp: Date.now()
    });
  });

  // טרייד — בקשה
  socket.on('trade_request', (data = {}) => {
    const { tradeId, initiatorId, receiverId } = data;
    console.log(`[TRADE] Request ${tradeId} from ${initiatorId} to ${receiverId}`);
    if (receiverId) io.to(receiverId).emit('trade_request_received', data);
  });

  // טרייד — עדכון סטטוס
  socket.on('trade_update', (data = {}) => {
    const { tradeId, status, tradeDetails } = data;
    console.log(`[TRADE] Update trade ${tradeId}, status: ${status}`);

    if (tradeDetails) {
      const otherPlayerId =
        socket.id === tradeDetails.initiator_id
          ? tradeDetails.receiver_id
          : tradeDetails.initiator_id;

      if (otherPlayerId) io.to(otherPlayerId).emit('trade_status_updated', data);
    }
  });

  // ניתוק
  socket.on('disconnect', () => {
    console.log(`[-] Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('player_disconnected', socket.id);
  });
});

// הפעלה
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Touch World server listening on port ${PORT}`);
});
