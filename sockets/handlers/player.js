// sockets/handlers/player.js
const players = require('../../core/players');

module.exports = function registerPlayerHandlers(io, socket) {
  // identify — מזהה/מעדכן זהות מלאה (שם, סקין, רול, ציוד, אזור)
  socket.on('identify', (identity = {}) => {
    const p = players.store[socket.id];
    if (!p) return;

    // עדכן זהות
    if (identity && typeof identity === 'object') {
      p.username       = identity.username ?? p.username;
      p.skin_code      = identity.skin_code ?? p.skin_code;
      p.admin_level    = identity.admin_level ?? p.admin_level;
      p.is_invisible   = !!(identity.is_invisible ?? p.is_invisible);
      p.keep_away_mode = !!(identity.keep_away_mode ?? p.keep_away_mode);
      p.current_area   = identity.current_area || p.current_area;

      if (identity.equipment && typeof identity.equipment === 'object') {
        p.equipment = { ...identity.equipment };
      }
    }

    // כעת השחקן מוכן להצגה
    p.ready = true;

    const view = players.safeView(p);

    // החזר אישור ללקוח
    socket.emit('identify_ok', view);

    // עדכן את כולם (כולל השולח) — שיראו מייד את התג/צבע/בגדים
    io.emit('player_moved', view);
  });

  // עדכוני תנועה/סטייט (שדות runtime בלבד)
  socket.on('player_update', (payload = {}) => {
    const p = players.store[socket.id];
    if (!p) return;

    players.mergeRuntimeUpdate(p, payload);

    // משדר לכל (לא רק broadcast) כדי שגם השולח יקבל תקנון אחיד
    io.emit('player_moved', players.safeView(p));
  });

  // שינוי אזור (לא משתמשים כרגע ב-rooms כדי למנוע העלמות — משדרים לכולם)
  socket.on('area_change', (data = {}) => {
    const p = players.store[socket.id];
    if (!p) return;

    p.current_area = typeof data.area === 'string' ? data.area : 'city';
    io.emit('player_area_changed', { id: p.id, current_area: p.current_area });
  });

  // שינוי ציוד — סלאט יחיד או מפה מלאה
  socket.on('equipment_change', (data = {}) => {
    const p = players.store[socket.id];
    if (!p) return;

    if (data && typeof data === 'object') {
      if (data.equipment && typeof data.equipment === 'object') {
        p.equipment = { ...data.equipment };
      } else if (typeof data.slot === 'string') {
        p.equipment = p.equipment || {};
        p.equipment[data.slot] = data.itemCode ?? null; // null = להסיר
      }
    }

    io.emit('player_equipment_changed', { id: p.id, equipment: p.equipment });
  });
};
