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
  if (!p) return null;
  return {
    id: p.id,
    username: p.username || '',

    // מצב תנועה/אנימציה
    position_x: p.position_x,
    position_y: p.position_y,
    direction: p.direction,
    animation_frame: p.animation_frame,
    is_moving: p.is_moving,

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
  'username', // אופציונלי — אם תרצה לעדכן שם תצוגה מתוך הקליינט
  'area'      // אם אתה משנה אזור דרך אירוע ייעודי, העדף להשתמש ב-area_change למטה
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
    username: '',             // אם תרצה — הקליינט יעדכן אח"כ
    position_x: 600,
    position_y: 400,
    direction: 'front',
    animation_frame: 'idle',
    is_moving: false,
    area: 'city',
    equipment: {}
  };

  // שלח למתחבר את כל השחקנים בצורה מסוננת (ללא bubbleMessage)
  const filtered = {};
  for (const [pid, pdata] of Object.entries(players)) {
    filtered[pid] = safePlayerView(pdata);
  }
  socket.emit('current_players', filtered);

  // עדכן את כל היתר על שחקן חדש
  socket.broadcast.emit('player_joined', safePlayerView(players[socket.id]));

  /**
   * עדכוני תנועה/מצב בסיסי מהלקוח.
   * כאן אנחנו ממזגים רק את ALLOWED_RUNTIME_FIELDS — לא בועות, לא פרטי חנות, לא "שדות זרים".
   */
  socket.on('player_update', (payload = {}) => {
    const p = players[socket.id];
    if (!p) return;
    mergeRuntimeUpdate(p, payload);
    socket.broadcast.emit('player_moved', safePlayerView(p));
  });

  /**
   * עדכון אזור מפורש (אם רוצים להפריד לוגית מאירועי תנועה).
   * זה עוזר להימנע ממצבים שבהם עדכון שחקן בגלל ציוד/DB "מאתחל" אזור.
   */
  socket.on('area_change', (data = {}) => {
    const p = players[socket.id];
    if (!p) return;
    const nextArea = typeof data.area === 'string' ? data.area : 'city';
    p.area = nextArea;
    // מודיעים לכל השחקנים (אפשר גם לפלטר לפי אזורים אם תרצה)
    io.emit('player_area_changed', { id: p.id, area: p.area });
  });

  /**
   * צ'אט — הודעות הן בזמן אמת בלבד, לא נשמרות בשרת.
   * כך אין "דליפת היסטוריה" להצטרפות חדשה.
   */
  socket.on('chat_message', (chatData = {}) => {
    const username = chatData.username || players[socket.id]?.username || 'Unknown';
    const message  = chatData.message  || '';
    const area     = players[socket.id]?.area || 'city';
    console.log(`[CHAT][${area}] ${username}: ${message}`);

    // משדרים לכולם; הקליינט יכול לסנן לפי אזור אם תרצה.
    io.emit('new_chat_message', {
      playerId: socket.id,
      message,
      username,
      adminLevel: chatData.adminLevel || 'user',
      area,
      timestamp: Date.now()
    });
  });

  /**
   * החלפת ציוד (equip/unequip)
   * לא נוגעים במיקום/אזור — רק מעדכנים את ה-appearance ומשדרים לכולם.
   */
  socket.on('equipment_change', (data = {}) => {
    const p = players[socket.id];
    if (!p) return;

    // data: { slot: 'head'|'body'|'feet'|..., itemId: 'item_123'|null }
    const slot = String(data.slot || '').trim();
    const itemId = data.itemId ?? null;

    if (!p.equipment) p.equipment = {};
    if (!slot) return;

    if (itemId) {
      p.equipment[slot] = itemId; // equip
    } else {
      delete p.equipment[slot];   // unequip
    }

    // משדרים את השינוי לכולם (כולל לשולח כדי לעדכן תצוגה אחידה)
    io.emit('player_equipment_changed', {
      id: p.id,
      slot,
      itemId,
      equipment: p.equipment
    });
  });

  /**
   * טרייד — בקשה
   */
  socket.on('trade_request', (data = {}) => {
    const { tradeId, initiatorId, receiverId } = data;
    console.log(`[TRADE] Request ${tradeId} from ${initiatorId} to ${receiverId}`);
    if (receiverId) io.to(receiverId).emit('trade_request_received', data);
  });

  /**
   * טרייד — עדכון סטטוס
   */
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

  /**
   * רסינק יזום מהלקוח (לא חובה, נוח לרה-קונקט)
   */
  socket.on('request_current_state', () => {
    const snapshot = {};
    for (const [pid, pdata] of Object.entries(players)) {
      snapshot[pid] = safePlayerView(pdata);
    }
    socket.emit('current_players', snapshot);
  });

  /**
   * ניתוק
   */
  socket.on('disconnect', () => {
    console.log(`[-] Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('player_disconnected', socket.id);
  });
});

/**
 * הפעלה
 */
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Touch World server listening on port ${PORT}`);
});
