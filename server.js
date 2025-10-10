// server.js — Express + Socket.IO (Node, בלי JSX/React)

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

/** כתובות שמורשות להתחבר (חשוב: בלי / בסוף) */
const allowedOrigins = [
  'https://touch-world-server.onrender.com',
  'https://touch-world.io',
  'http://localhost:5173',
  'http://localhost:8081',
];

/** CORS עבור HTTP (בריאות/בדיקות) */
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // אפליקציות מובייל/כלים ללא Origin
      return allowedOrigins.includes(origin)
        ? cb(null, true)
        : cb(new Error('CORS blocked: ' + origin));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  })
);

/** זיכרון שחקנים בסיסי (RAM) */
const players = Object.create(null);

/** View בטוח לשידור ללקוחות */
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
    skin_code: p.skin_code,
    area: p.area || 'city',
    equipment: p.equipment || {},
  };
}

/** אילו שדות מותר לעדכן ב־player_update */
const ALLOWED_RUNTIME_FIELDS = new Set([
  'position_x',
  'position_y',
  'direction',
  'animation_frame',
  'is_moving',
  'username',
  'skin_code',
  'area', // לא חובה, יש גם אירוע area_change; נשאיר בשביל תאימות
]);

function mergeRuntimeUpdate(dst, src) {
  for (const k of Object.keys(src || {})) {
    if (ALLOWED_RUNTIME_FIELDS.has(k)) dst[k] = src[k];
  }
}

/** עוזר: השמטת שחקנים שאינם באזור */
function filterPlayersByArea(area) {
  const out = {};
  for (const [pid, pdata] of Object.entries(players)) {
    if (!pdata) continue;
    if ((pdata.area || 'city') === area) {
      const v = safePlayerView(pdata);
      if (v) out[pid] = v;
    }
  }
  return out;
}

/** Health Check */
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Touch World Realtime Server is running.',
    connected_players_count: Object.keys(players).length,
    connected_players_ids: Object.keys(players),
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
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  allowEIO3: false,
});

/** עוזרים לשידור לפי אזור */
function emitToArea(area, event, payload) {
  io.to(area).emit(event, payload);
}

io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  // יצירת שחקן בסיסי + אזור ברירת מחדל
  players[socket.id] = {
    id: socket.id,
    username: '',            // ייקבע מצד הלקוח דרך player_update
    position_x: 600,
    position_y: 400,
    direction: 'front',
    animation_frame: 'idle',
    is_moving: false,
    area: 'city',
    skin_code: 'blue',
    equipment: {},
  };

  // צרף את הסוקט לחדר של האזור
  let currentArea = players[socket.id].area || 'city';
  socket.join(currentArea);

  // שלח לשחקן החדש את רשימת השחקנים באזור שלו בלבד
  socket.emit('current_players', filterPlayersByArea(currentArea));

  // שדר לשאר באזור ששחקן חדש הצטרף (רק אם יש View תקין)
  const joinedView = safePlayerView(players[socket.id]);
  if (joinedView) {
    emitToArea(currentArea, 'player_joined', joinedView);
  }

  /** קבלת עדכון מצב שחקן (תנועה/שם/סקין...) */
  socket.on('player_update', (payload = {}) => {
    const p = players[socket.id];
    if (!p) return;

    const prevArea = p.area || 'city';
    const hadUsername = !!p.username;

    mergeRuntimeUpdate(p, payload);

    // אם מישהו ניסה לשנות area דרך player_update – ניישר עם החדרים
    if ((p.area || 'city') !== prevArea) {
      // עזוב חדר ישן
      socket.leave(prevArea);
      // הצטרף לחדש
      currentArea = p.area || 'city';
      socket.join(currentArea);
      // שלח לו את שחקני האזור החדש
      socket.emit('current_players', filterPlayersByArea(currentArea));
      // עדכן את האזור הישן שהשחקן עזב
      emitToArea(prevArea, 'player_disconnected', p.id);
      // עדכן את האזור החדש שהשחקן נכנס
      emitToArea(currentArea, 'player_joined', safePlayerView(p));
      return;
    }

    const view = safePlayerView(p);
    if (!view) return;

    if (!hadUsername && p.username) {
      console.log(`[+] Player ${socket.id} identified as ${p.username}`);
      emitToArea(currentArea, 'player_joined', view);
    } else {
      // עדכון תנועה/מצב – לשחקני אותו אזור בלבד
      emitToArea(currentArea, 'player_moved', view);
    }
  });

  /** שינוי אזור מפורש */
  socket.on('area_change', (data = {}) => {
    const p = players[socket.id];
    if (!p) return;

    const fromArea = p.area || 'city';
    const toArea = typeof data.area === 'string' ? data.area : 'city';
    if (toArea === fromArea) return;

    p.area = toArea;

    // עזוב/הצטרף חדרים
    socket.leave(fromArea);
    socket.join(toArea);
    currentArea = toArea;

    // עדכן את שני האזורים
    emitToArea(fromArea, 'player_disconnected', p.id);
    emitToArea(toArea, 'player_joined', safePlayerView(p));

    // שלח לשחקן את רשימת השחקנים באזור החדש
    socket.emit('current_players', filterPlayersByArea(toArea));

    // שדר אירוע אזור השתנה (אם אתה צריך לוגיקה בצד לקוח)
    emitToArea(toArea, 'player_area_changed', { id: p.id, area: p.area });
  });

  /** צ'אט – שדר רק לאזור הנוכחי; אין שמירת היסטוריה */
  socket.on('chat_message', (chatData = {}) => {
    const p = players[socket.id];
    if (!p) return;

    const username = chatData.username || p.username || 'Unknown';
    const message = chatData.message || '';
    const area = p.area || 'city';

    console.log(`[CHAT][${area}] ${username}: ${message}`);

    emitToArea(area, 'new_chat_message', {
      playerId: socket.id,
      message,
      username,
      adminLevel: chatData.adminLevel || 'user',
      timestamp: Date.now(),
    });
  });

  /** שינוי ציוד */
  socket.on('equipment_change', (data = {}) => {
    const p = players[socket.id];
    if (!p) return;

    // תמיכה בשני הפורמטים:
    // 1) { slot, itemId }
    // 2) { equipment: {...} }
    if (typeof data.equipment === 'object' && data.equipment !== null) {
      p.equipment = { ...(p.equipment || {}), ...data.equipment };
    } else if (data.slot) {
      p.equipment = p.equipment || {};
      if (data.itemId) {
        p.equipment[data.slot] = data.itemId;
      } else {
        delete p.equipment[data.slot];
      }
    }

    console.log(
      `[EQUIP] ${p.username || socket.id} changed equipment =>`,
      JSON.stringify(p.equipment)
    );

    // שדר לשחקני האזור בלבד
    const area = p.area || 'city';
    emitToArea(area, 'player_equipment_changed', {
      id: p.id,
      equipment: p.equipment,
    });
  });

  /** מסחר */
  socket.on('trade_request', (data = {}) => {
    const { tradeId, initiatorId, receiverId } = data || {};
    console.log(`[TRADE] Request ${tradeId} from ${initiatorId} to ${receiverId}`);
    if (receiverId) io.to(receiverId).emit('trade_request_received', data);
  });

  socket.on('trade_update', (data = {}) => {
    const { tradeId, status, tradeDetails } = data || {};
    console.log(`[TRADE] Update trade ${tradeId}, status: ${status}`);

    if (tradeDetails) {
      const otherPlayerId =
        socket.id === tradeDetails.initiator_id
          ? tradeDetails.receiver_id
          : tradeDetails.initiator_id;

      if (otherPlayerId) io.to(otherPlayerId).emit('trade_status_updated', data);
    }
  });

  /** לקוח מבקש סנכרון מצב נוכחי (למשל אחרי reconnect) */
  socket.on('request_current_state', () => {
    const p = players[socket.id];
    if (!p) return;
    socket.emit('current_players', filterPlayersByArea(p.area || 'city'));
  });

  /** ניתוק */
  socket.on('disconnect', () => {
    console.log(`[-] Player disconnected: ${socket.id}`);
    const p = players[socket.id];
    const area = p?.area || 'city';
    delete players[socket.id];
    // עדכן רק את האזור שלו
    emitToArea(area, 'player_disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Touch World server listening on port ${PORT}`);
});
