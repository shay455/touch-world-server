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
 * שים לב: לא שומרים כאן שדות זמניים כמו bubbleMessage כדי לא "לדלוף" לחדשים.
 */
const players = Object.create(null);

/**
 * Helper: מסננים את נתוני השחקן ל"שידור בטוח" (ללא שדות זמניים/רגישים).
 * כאן מגדירים במפורש מה מותר לראות בצד לקוח.
 */
function safePlayerView(p) {
  if (!p || !p.username) return null; // *** FIX: Don't broadcast players without a username
  return {
    id: p.id,
    username: p.username || '',

    // מצב תנועה/אנימציה
    position_x: p.position_x,
    position_y: p.position_y,
    direction: p.direction,
    animation_frame: p.animation_frame,
    is_moving: p.is_moving,
    skin_code: p.skin_code, // Add skin_code for correct rendering

    // אזור (אם בשימוש אצלך)
    area: p.area || 'city',

    // סט ציוד שמוצג באווטאר (למשל { head: 'item_123', body: 'item_777' })
    equipment: p.equipment || {}
  };
}

/**
 * Helper: ממזגים עדכון תנועה/סטייט בסיסי בלבד.
 * לא מאפשרים להכניס bubbleMessage/שדות שרירותיים דרך player_update.
 */
const ALLOWED_RUNTIME_FIELDS = new Set([
  'position_x',
  'position_y',
  'direction',
  'animation_frame',
  'is_moving',
  'username',
  'skin_code',
  'area'
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

  // צור שחקן בסיסי ללא בועות וצ׳אטים בהיסטוריה
  players[socket.id] = {
    id: socket.id,
    username: '', // הקליינט יעדכן את זה מיד עם החיבור
    position_x: 600,
    position_y: 400,
    direction: 'front',
    animation_frame: 'idle',
    is_moving: false,
    area: 'city',
    skin_code: 'blue',
    equipment: {}
  };

  // שלח למתחבר את כל השחקנים בצורה מסוננת (ללא bubbleMessage)
  const filtered = {};
  for (const [pid, pdata] of Object.entries(players)) {
      const safeView = safePlayerView(pdata);
      if (safeView) { // Only add players that pass the safe view check (e.g., have a username)
        filtered[pid] = safeView;
      }
  }
  socket.emit('current_players', filtered);

  // עדכן את כל היתר על שחקן חדש (רק אם יש לו שם משתמש)
  const safeNewPlayer = safePlayerView(players[socket.id]);
  if (safeNewPlayer) {
    socket.broadcast.emit('player_joined', safeNewPlayer);
  }


  /**
   * עדכוני תנועה/מצב בסיסי מהלקוח.
   */
  socket.on('player_update', (payload = {}) => {
    const p = players[socket.id];
    if (!p) return;
    
    const hadUsername = !!p.username;
    mergeRuntimeUpdate(p, payload);
    
    // If the username was just set, broadcast the player to everyone
    if (!hadUsername && p.username) {
        console.log(`[+] Player ${socket.id} is now identified as ${p.username}`);
        io.emit('player_joined', safePlayerView(p));
    } else {
        socket.broadcast.emit('player_moved', safePlayerView(p));
    }
  });

  /**
   * עדכון אזור מפורש
   */
  socket.on('area_change', (data = {}) => {
    const p = players[socket.id];
    if (!p) return;
    const nextArea = typeof data.area === 'string' ? data.area : 'city';
    p.area = nextArea;
    io.emit('player_area_changed', { id: p.id, area: p.area });
  });

  /**
   * צ'אט
   */
  socket.on('chat_message', (chatData = {}) => {
    const p = players[socket.id];
    if (!p) return;

    const username = chatData.username || p.username || 'Unknown';
    const message  = chatData.message  || '';
    const area     = p.area || 'city';
    console.log(`[CHAT][${area}] ${username}: ${message}`);

    io.to(area).emit('new_chat_message', { // Only send to players in the same area
      playerId: socket.id,
      message,
      username,
      adminLevel: chatData.adminLevel  || 'user',
      timestamp: Date.now()
    });
  });

  /**
   * עדכון ציוד ייעודי
   */
  socket.on('equipment_change', (data = {}) => {
    const p = players[socket.id];
    if (!p) return;

    // Sanitize and update equipment
    if (typeof data.equipment === 'object' && data.equipment !== null) {
      p.equipment = data.equipment;
    }
    
    console.log(`[EQUIP] Player ${p.username || socket.id} updated equipment.`);
    
    // Broadcast the change to everyone
    io.emit('player_equipment_changed', {
      id: p.id,
      equipment: p.equipment
    });
  });


  // בקשת טרייד
  socket.on('trade_request', (data = {}) => {
    const { tradeId, initiatorId, receiverId } = data;
    console.log(`[TRADE] Request ${tradeId} from ${initiatorId} to ${receiverId}`);
    if (receiverId) io.to(receiverId).emit('trade_request_received', data);
  });

  // עדכון טרייד
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

// הפעלת השרת
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Touch World server listening on port ${PORT}`);
});
