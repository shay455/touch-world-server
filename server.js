// server.js — Express + Socket.IO (Node, בלי JSX/React)

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

/**
 * IMPORTANT:
 * בלי סלאש בסוף — כך ה-Origin מגיע מהדפדפן.
 */
const allowedOrigins = [
  'https://touch-world-server.onrender.com',
  'https://touch-world.io',
  'http://localhost:5173',
  'http://localhost:8081'
];

/**
 * CORS עבור HTTP (כולל / health)
 */
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // מאפשר כלים בלי Origin (מובייל/בדיקות/בריאות)
      return allowedOrigins.includes(origin)
        ? cb(null, true)
        : cb(new Error('CORS blocked: ' + origin));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
  })
);

/**
 * זיכרון שחקנים (in-memory).
 */
const players = Object.create(null);

/**
 * Helper: מסננים את נתוני השחקן ל"שידור בטוח" (ללא שדות זמניים/רגישים).
 */
function safePlayerView(p) {
  if (!p) return null;
  return {
    id: p.id,
    username: p.username || '',
    position_x: p.position_x,
    position_y: p.position_y,
    direction: p.direction,
    animation_frame: p.animation_frame,
    is_moving: p.is_moving,
    skin_code: p.skin_code || 'blue',
    equipment: p.equipment || {}
  };
}

/**
 * Helper: ממזגים עדכון תנועה/סטייט בסיסי בלבד.
 */
const ALLOWED_RUNTIME_FIELDS = new Set([
  'position_x',
  'position_y',
  'direction',
  'animation_frame',
  'is_moving',
  'username',
  'is_invisible',
  'keep_away_mode'
]);

function mergeRuntimeUpdate(dst, src) {
  for (const k of Object.keys(src || {})) {
    if (ALLOWED_RUNTIME_FIELDS.has(k)) {
      dst[k] = src[k];
    }
  }
}

/**
 * Health check
 */
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Touch World Realtime Server is running.',
    connected_players_count: Object.keys(players).length,
    connected_players_ids: Object.keys(players)
  });
});

/**
 * Socket.IO
 */
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

io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  // צור שחקן בסיסי
  players[socket.id] = {
    id: socket.id,
    username: '',
    position_x: 600,
    position_y: 400,
    direction: 'front',
    animation_frame: 'idle',
    is_moving: false,
    skin_code: 'blue',
    equipment: {}
  };

  const filtered = {};
  for (const [pid, pdata] of Object.entries(players)) {
    filtered[pid] = safePlayerView(pdata);
  }
  socket.emit('current_players', filtered);

  socket.broadcast.emit('player_joined', safePlayerView(players[socket.id]));

  socket.on('player_update', (payload = {}) => {
    const p = players[socket.id];
    if (!p) return;
    mergeRuntimeUpdate(p, payload);
    socket.broadcast.emit('player_moved', safePlayerView(p));
  });

  socket.on('area_change', (data = {}) => {
    const p = players[socket.id];
    if (!p) return;
    p.area = typeof data.area === 'string' ? data.area : 'city';
    io.emit('player_area_changed', { id: p.id, current_area: p.area });
  });

  socket.on('chat_message', (chatData = {}) => {
    const p = players[socket.id];
    if (!p) return;
    const username = chatData.username || p.username || 'Unknown';
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

  socket.on('equipment_change', (data = {}) => {
    const p = players[socket.id];
    if (!p) return;
    const { slot, itemId } = data;
    if (typeof slot === 'string') {
        p.equipment = p.equipment || {};
        p.equipment[slot] = itemId; // itemId can be null to unequip
        console.log(`[EQUIP] Player ${p.id} changed ${slot} to ${itemId}`);
        io.emit('player_equipment_changed', { id: p.id, equipment: p.equipment });
    }
  });
  
  socket.on('trade_request', (data = {}) => {
    const { tradeId, initiatorId, receiverId } = data;
    console.log(`[TRADE] Request ${tradeId} from ${initiatorId} to ${receiverId}`);
    if (receiverId) io.to(receiverId).emit('trade_request_received', data);
  });

  socket.on('trade_update', (data = {}) => {
    const { tradeId, status, tradeDetails } = data;
    console.log(`[TRADE] Update trade ${tradeId}, status: ${status}`);
    if (tradeDetails) {
      const otherPlayerId = socket.id === tradeDetails.initiator_id
          ? tradeDetails.receiver_id
          : tradeDetails.initiator_id;
      if (otherPlayerId) io.to(otherPlayerId).emit('trade_status_updated', data);
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
