// sockets/handlers/player.js

/**
 * ניהול אירועי שחקנים בצד השרת
 * נטען מתוך server.js דרך sockets/index.js
 */

module.exports = function registerPlayerHandlers(io, socket, players) {

  /**
   * כשהשחקן מתחבר (או מזהה את עצמו)
   * נוודא שלא נוצרים כפילויות.
   */
  socket.on('identify', (data = {}) => {
    const { id, username, user_id, admin_level, current_area, equipment } = data;

    // מחפש אם כבר יש שחקן עם אותו user_id
    const existingPlayerId = Object.keys(players).find(pid => players[pid].user_id === user_id);

    // אם השחקן כבר קיים (נגיד חיבור מחדש) — מעדכן את הנתונים הקיימים
    if (existingPlayerId) {
      console.log(♻️ Reconnecting player: ${username} (${user_id}));

      // מוחק את הרשומה הישנה
      if (existingPlayerId !== socket.id) {
        delete players[existingPlayerId];
      }
    } else {
      console.log(✅ New player identified: ${username} (${user_id}));
    }

    // יוצר / מעדכן את השחקן החדש
    players[socket.id] = {
      id: socket.id,
      username,
      user_id,
      admin_level: admin_level || 'user',
      current_area: current_area || 'city',
      position_x: 600,
      position_y: 400,
      direction: 'front',
      animation_frame: 'idle',
      is_moving: false,
      equipment: equipment || {},
      is_invisible: !!data.is_invisible,
      keep_away_mode: !!data.keep_away_mode
    };

    // שולח לכל השחקנים את רשימת השחקנים המעודכנת
    io.emit('current_players', players);

    // מאשר ללקוח שהזהות נקלטה
    socket.emit('identify_ok', players[socket.id]);
  });

  /**
   * עדכון תנועה / מצב שחקן
   */
  socket.on('player_update', (update = {}) => {
    const p = players[socket.id];
    if (!p) return;

    // נעדכן רק שדות רלוונטיים
    const allowedFields = [
      'position_x',
      'position_y',
      'direction',
      'animation_frame',
      'is_moving',
      'equipment',
      'is_invisible',
      'keep_away_mode'
    ];

    for (const key of allowedFields) {
      if (update[key] !== undefined) {
        p[key] = update[key];
      }
    }

    socket.broadcast.emit('player_moved', p);
  });

  /**
   * שינוי אזור
   */
  socket.on('area_change', (data = {}) => {
    const p = players[socket.id];
    if (!p) return;

    const nextArea = typeof data.area === 'string' ? data.area : 'city';
    console.log(🌍 ${p.username} moved to area: ${nextArea});
    p.current_area = nextArea;

    io.emit('player_area_changed', { id: p.id, current_area: nextArea });
  });

  /**
   * שינוי ציוד
   */
  socket.on('equipment_change', (data = {}) => {
    const p = players[socket.id];
    if (!p) return;

    if (data.slot && data.itemCode) {
      p.equipment = { ...p.equipment, [data.slot]: data.itemCode };
    } else if (data.equipment) {
      p.equipment = data.equipment;
    }

    io.emit('player_equipment_changed', { id: p.id, equipment: p.equipment });
  });

  /**
   * הודעות צ׳אט
   */
  socket.on('chat_message', (chatData = {}) => {
    const p = players[socket.id];
    if (!p) return;

    const username = chatData.username || p.username || 'Unknown';
    const message = chatData.message || '';

    console.log([CHAT] ${username}: ${message});
    io.emit('new_chat_message', {
      playerId: socket.id,
      username,
      message,
      adminLevel: chatData.adminLevel || p.admin_level || 'user',
      timestamp: Date.now()
    });
  });

  /**
   * ניתוק שחקן
   */
  socket.on('disconnect', () => {
    const p = players[socket.id];
    if (!p) return;

    console.log(❌ Player disconnected: ${p.username} (${socket.id}));
    delete players[socket.id];
    io.emit('player_disconnected', socket.id);
  });
};
