// sockets/handlers/player.js
module.exports = function registerPlayerHandlers(io, socket, players, bus) {
  // bus: { addUserSocket, removeUserSocket, emitToUser }

  socket.on('identify', (data = {}) => {
    const { user_id, username, admin_level, current_area, equipment } = data;

    // מניעת כפילויות לפי user_id
    const existingId = Object.keys(players).find(pid => players[pid].user_id === user_id);
    if (existingId && existingId !== socket.id) delete players[existingId];

    players[socket.id] = {
      id: socket.id,
      user_id,
      username: username || '',
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

    // רושם את הסוקט עבור המשתמש
    bus.addUserSocket(user_id, socket.id);

    io.emit('current_players', players);
    socket.emit('identify_ok', players[socket.id]);
  });

  socket.on('player_update', (update = {}) => {
    const p = players[socket.id];
    if (!p) return;
    const allowed = [
      'position_x','position_y','direction','animation_frame','is_moving',
      'equipment','is_invisible','keep_away_mode'
    ];
    for (const k of allowed) if (update[k] !== undefined) p[k] = update[k];
    socket.broadcast.emit('player_moved', p);
  });

  socket.on('area_change', ({ area } = {}) => {
    const p = players[socket.id];
    if (!p) return;
    p.current_area = typeof area === 'string' ? area : 'city';
    io.emit('player_area_changed', { id: p.id, current_area: p.current_area });
  });

  socket.on('equipment_change', (data = {}) => {
    const p = players[socket.id];
    if (!p) return;
    if (data.slot) {
      p.equipment = { ...(p.equipment || {}), [data.slot]: data.itemCode ?? null };
    } else if (data.equipment) {
      p.equipment = data.equipment;
    }
    io.emit('player_equipment_changed', { id: p.id, equipment: p.equipment });
  });

  socket.on('disconnect', () => {
    const p = players[socket.id];
    if (p?.user_id) bus.removeUserSocket(p.user_id, socket.id);
    delete players[socket.id];
    io.emit('player_disconnected', socket.id);
  });

  /**
   * דוגמה: אם יש לכם נקודת קנייה בצד שרת (HTTP) שמעדכנת DB,
   * לאחר העדכון תוכלו לקרוא:
   *    bus.emitToUser(io, userId, 'wallet_changed', { coins, gems });
   * כדי לדחוף את היתרה המעודכנת ללקוח בזמן אמת.
   */
};
