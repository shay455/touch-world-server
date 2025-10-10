// sockets/handlers/player.js
'use strict';

/**
 * רישום האנדלרים של שחקן בודד.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {{
 *   players: Record<string, any>,
 *   safePlayerView: (p:any)=>any,
 *   mergeRuntimeUpdate: (dst:any, src:any)=>void,
 * }} deps
 */
module.exports = function registerPlayerHandlers(io, socket, deps) {
  const { players, safePlayerView, mergeRuntimeUpdate } = deps;

  // יצירת רשומת שחקן בסיסית (אם לא קיימת כבר)
  if (!players[socket.id]) {
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
      skin_code: 'blue',
      ready: false
    };
  }

  // שליחת כל השחקנים למתחבר החדש
  const snapshot = {};
  for (const [pid, pdata] of Object.entries(players)) {
    snapshot[pid] = safePlayerView(pdata);
  }
  socket.emit('current_players', snapshot);

  // מודיעים לכל היתר שיש שחקן חדש (עדיין בלי זהות מלאה)
  socket.broadcast.emit('player_joined', safePlayerView(players[socket.id]));

  /**
   * identify – שליחת זהות מלאה לאחר connect/reconnect
   * מצופה לקבל: { username, user_id, admin_level, current_area, equipment, is_invisible, keep_away_mode, skin_code }
   */
  socket.on('identify', (payload = {}) => {
    const p = players[socket.id];
    if (!p) return;

    const {
      username = '',
      user_id = null,
      admin_level = 'user',
      current_area = 'city',
      equipment = {},
      is_invisible = false,
      keep_away_mode = false,
      skin_code = 'blue'
    } = payload;

    p.username = username;
    p.user_id = user_id;
    p.admin_level = admin_level;
    p.current_area = current_area || 'city';
    p.equipment = equipment || {};
    p.is_invisible = !!is_invisible;
    p.keep_away_mode = !!keep_away_mode;
    p.skin_code = skin_code || 'blue';
    p.ready = true;

    console.log(`♻️ Reconnecting/Identifying player: ${username} (${user_id || 'no-user-id'}) from socket ${socket.id}`);

    // מאשרים לקליינט
    socket.emit('identify_ok', safePlayerView(p));
    // משדרים לכולם את המראה המעודכן
    socket.broadcast.emit('player_moved', safePlayerView(p));
  });

  /**
   * עדכון מצב/תנועה בזמן אמת
   * מצופה רק לשדות runtime (position_x, position_y, direction, animation_frame, is_moving, move_type, is_invisible, keep_away_mode, equipment)
   */
  socket.on('player_update', (payload = {}) => {
    const p = players[socket.id];
    if (!p) return;

    mergeRuntimeUpdate(p, payload);
    socket.broadcast.emit('player_moved', safePlayerView(p));
  });

  /**
   * שינוי אזור מפורש
   * מצופה: { area: string }
   */
  socket.on('area_change', (data = {}) => {
    const p = players[socket.id];
    if (!p) return;

    const nextArea = typeof data.area === 'string' ? data.area : 'city';
    p.current_area = nextArea;

    console.log(`➡️ Area change: ${p.username || socket.id} -> ${p.current_area}`);
    io.emit('player_area_changed', { id: p.id, current_area: p.current_area });
  });

  /**
   * שינוי ציוד
   * אפשר לשגר או { slot, itemCode } או { equipment: {...} }
   */
  socket.on('equipment_change', (data = {}) => {
    const p = players[socket.id];
    if (!p) return;

    if (data && typeof data === 'object') {
      if (data.equipment && typeof data.equipment === 'object') {
        p.equipment = { ...data.equipment };
      } else if (typeof data.slot === 'string') {
        p.equipment = p.equipment || {};
        p.equipment[data.slot] = data.itemCode ?? null;
      }
    }

    console.log(`🧩 Equipment changed: ${p.username || socket.id}`);
    io.emit('player_equipment_changed', { id: p.id, equipment: p.equipment });
  });

  /**
   * הודעת צ'אט (בשידור חי בלבד)
   * מצופה: { username, message, adminLevel }
   */
  socket.on('chat_message', (chatData = {}) => {
    const p = players[socket.id];
    if (!p) return;

    const username = chatData.username || p.username || 'Unknown';
    const message = chatData.message || '';
    const adminLevel = chatData.adminLevel || p.admin_level || 'user';

    console.log(`[CHAT][${p.current_area}] ${username}: ${message}`);

    io.emit('new_chat_message', {
      playerId: p.id,
      message,
      username,
      adminLevel,
      timestamp: Date.now()
    });
  });

  /**
   * טרייד – בקשה
   */
  socket.on('trade_request', (data = {}) => {
    const { tradeId, initiatorId, receiverId } = data;
    console.log(`🛒 Trade request ${tradeId} from ${initiatorId} to ${receiverId}`);
    if (receiverId) io.to(receiverId).emit('trade_request_received', data);
  });

  /**
   * טרייד – עדכון סטטוס
   */
  socket.on('trade_update', (data = {}) => {
    const { tradeId, status, tradeDetails } = data;
    console.log(`🔁 Trade update ${tradeId}, status: ${status}`);

    if (tradeDetails) {
      const otherPlayerId =
        socket.id === (tradeDetails.initiator_id || tradeDetails.initiatorId)
          ? (tradeDetails.receiver_id || tradeDetails.receiverId)
          : (tradeDetails.initiator_id || tradeDetails.initiatorId);

      if (otherPlayerId) io.to(otherPlayerId).emit('trade_status_updated', data);
    }
  });

  /**
   * ניתוק
   */
  socket.on('disconnect', (reason) => {
    const p = players[socket.id];
    console.log(`🔌 Disconnected: ${socket.id} (${reason})`);
    delete players[socket.id];
    io.emit('player_disconnected', socket.id);
  });
};
