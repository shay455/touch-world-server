// server.js — Express + Socket.IO

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

/** בלי / בסוף! כך ה-Origin מגיע מהדפדפן */
const allowedOrigins = [
  'https://touch-world-server.onrender.com',
  'https://touch-world.io',
  'http://localhost:5173',
  'http://localhost:8081'
];

/** CORS ל־HTTP */
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      return allowedOrigins.includes(origin)
        ? cb(null, true)
        : cb(new Error('CORS blocked: ' + origin));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
  })
);

/** מאגר שחקנים בזיכרון */
const players = Object.create(null);

/** מה מותר לשדר ללקוח */
function safePlayerView(p) {
  if (!p) return null;
  return {
    id: p.id,
    username: p.username || '',
    // תנועה
    position_x: p.position_x,
    position_y: p.position_y,
    direction: p.direction,
    animation_frame: p.animation_frame,
    is_moving: p.is_moving,
    move_type: p.move_type || 'walk',
    // אזור
    current_area: p.current_area || 'city',
    // ציוד
    equipment: p.equipment || {},
    // סטטוסים
    is_invisible: !!p.is_invisible,
    keep_away_mode: !!p.keep_away_mode,
    admin_level: p.admin_level || 'user',
    skin_code: p.skin_code || 'blue'
  };
}

/** אילו שדות מותר לעדכן דרך player_update */
const ALLOWED_RUNTIME_FIELDS = new Set([
  'position_x',
  'position_y',
  'direction',
  'animation_frame',
  'is_moving',
  'move_type',
  'username',
  'admin_level',
  'current_area' // נשתמש גם ב-area_change, אך תומך גם כאן אם נשלח בבוטסטרפ
]);

function mergeRuntimeUpdate(dst, src) {
  for (const k of Object.keys(src || {})) {
    if (ALLOWED_RUNTIME_FIELDS.has(k)) dst[k] = src[k];
  }
  // ציוד – לא מעדכנים במאסה, רק דרך equipment_change כדי למנוע תלייה של אובייקט ענק
}

/** health */
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Touch World Realtime Server is running.',
    connected_players_count: Object.keys(players).length,
    connected_players_ids: Object.keys(players)
  });
});

/** Socket.IO */
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

  // שחקן בסיסי
  players[socket.id] = {
    id: socket.id,
    username: '',
    position_x: 600,
    position_y: 400,
    direction: 'front',
    animation_frame: 'idle',
    is_moving: false,
    move_type: 'walk',
    current_area: 'city',
    equipment: {},
    is_invisible: false,
    keep_away_mode: false,
    admin_level: 'user',
    skin_code: 'blue'
  };

  // שלח למתחבר את כל השחקנים
  const snapshot = {};
  for (const [pid, p] of Object.entries(players)) snapshot[pid] = safePlayerView(p);
  socket.emit('current_players', snapshot);

  // עדכן אחרים על המתחבר
  socket.broadcast.emit('player_joined', safePlayerView(players[socket.id]));

  // עדכוני תנועה/סטייט קלילים + בוטסטרפ ראשוני (username/area וכו')
  socket.on('player_update', (payload = {}) => {
    const p = players[socket.id];
    if (!p) return;

    const beforeHadName = !!p.username;
    mergeRuntimeUpdate(p, payload);

    const view = safePlayerView(p);
    if (!beforeHadName && p.username) {
      // כאשר זהות התקבלה – תודיע לכולם שוב כשחקן חדש
      io.emit('player_joined', view);
    } else {
      socket.broadcast.emit('player_moved', view);
    }
  });

  // מעבר אזור מפורש
  socket.on('area_change', (data = {}) => {
    const p = players[socket.id];
    if (!p) return;
    const nextArea = typeof data.area === 'string' ? data.area : 'city';
    p.current_area = nextArea;
    io.emit('player_area_changed', { id: p.id, current_area: p.current_area });
  });

  // שינוי פריט בודד – slot + itemCode (או null להסרה)
  socket.on('equipment_change', (data = {}) => {
    const p = players[socket.id];
    if (!p) return;

    const { slot, itemCode } = data;
    if (typeof slot === 'string') {
      p.equipment = p.equipment || {};
      p.equipment[slot] = itemCode ?? null;
      io.emit('player_equipment_changed', { id: p.id, equipment: p.equipment });
    }
  });

  // צ׳אט – הודעות בזמן אמת בלבד
  socket.on('chat_message', (chatData = {}) => {
    const p = players[socket.id];
    if (!p) return;

    const username = chatData.username || p.username || 'Unknown';
    const message  = chatData.message || '';
    console.log(`[CHAT][${p.current_area}] ${username}: ${message}`);

    io.emit('new_chat_message', {
      playerId: socket.id,
      message,
      username,
      adminLevel: chatData.adminLevel || 'user',
      timestamp: Date.now()
    });
  });

  // טריידים
  socket.on('trade_request', (data = {}) => {
    const { tradeId, initiatorId, receiverId } = data;
    if (receiverId) {
      console.log(`[TRADE] Request ${tradeId} from ${initiatorId} to ${receiverId}`);
      io.to(receiverId).emit('trade_request_received', data);
    }
  });

  socket.on('trade_update', (data = {}) => {
    const { tradeId, status, tradeDetails } = data;
    console.log(`[TRADE] Update trade ${tradeId}, status: ${status}`);
    if (tradeDetails) {
      const otherId =
        socket.id === tradeDetails.initiator_id
          ? tradeDetails.receiver_id
          : tradeDetails.initiator_id;
      if (otherId) io.to(otherId).emit('trade_status_updated', data);
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
