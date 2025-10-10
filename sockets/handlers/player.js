const { players, mergeRuntime, safePlayerView } = require('../../core/players');

module.exports = function registerPlayerHandlers(io, socket) {
  // identify — הלקוח שולח פרטי פרופיל מלאים אחרי התחברות
  socket.on('identify', (profile = {}) => {
    const p = players[socket.id];
    if (!p) return;

    const allowedInitial = [
      'username', 'skin_code', 'admin_level',
      'equipment', 'current_area', 'is_invisible', 'keep_away_mode'
    ];
    for (const key of allowedInitial) {
      if (profile[key] !== undefined) p[key] = profile[key];
    }

    p.ready = true;
    const view = safePlayerView(p);

    // שדר לשאר שהשחקן הצטרף עם ה"ויזואל" הנכון (צבע/בגדים/תג)
    socket.broadcast.emit('player_joined', view);
    socket.emit('identify_ok', view);
  });

  // עדכוני תנועה/סטייט
  socket.on('player_update', (payload = {}) => {
    const p = players[socket.id];
    if (!p) return;
    mergeRuntime(p, payload);
    if (!p.ready) return;
    socket.broadcast.emit('player_moved', safePlayerView(p));
  });

  // שינוי אזור
  socket.on('area_change', (data = {}) => {
    const p = players[socket.id];
    if (!p) return;
    p.current_area = typeof data.area === 'string' ? data.area : 'city';
    if (!p.ready) return;
    io.emit('player_area_changed', { id: p.id, current_area: p.current_area });
  });

  // שינוי ציוד — תומך גם בסנכרון מלא וגם בסלאט יחיד
  socket.on('equipment_change', (data = {}) => {
    const p = players[socket.id];
    if (!p) return;

    if (data && typeof data.equipment === 'object' && data.equipment !== null) {
      // סנכרון מלא
      p.equipment = data.equipment;
    } else {
      // שינוי של סלאט בודד
      const { slot, itemCode } = data; // שים לב: itemCode (לא itemId)
      if (typeof slot === 'string') {
        p.equipment = p.equipment || {};
        if (itemCode === null || itemCode === undefined) {
          delete p.equipment[slot];
        } else {
          p.equipment[slot] = itemCode;
        }
      }
    }

    if (!p.ready) return;
    io.emit('player_equipment_changed', { id: p.id, equipment: p.equipment });
  });

  // ניתוק
  socket.on('disconnect', () => {
    console.log(`[-] Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('player_disconnected', socket.id);
  });
};
