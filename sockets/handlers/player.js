// sockets/handlers/player.js
module.exports = (io, socket, players, safePlayerView, mergeRuntimeUpdate) => {
  socket.on('player_update', (data = {}) => {
    const player = players[socket.id];
    if (!player) return;
    mergeRuntimeUpdate(player, data);
    socket.broadcast.emit('player_moved', safePlayerView(player));
  });

  socket.on('area_change', (data = {}) => {
    const player = players[socket.id];
    if (!player) return;
    player.current_area = data.area || 'city';
    io.emit('player_area_changed', { id: player.id, current_area: player.current_area });
  });

  socket.on('equipment_change', (data = {}) => {
    const player = players[socket.id];
    if (!player) return;
    const { slot, itemCode } = data;
    if (!slot) return;
    player.equipment[slot] = itemCode ?? null;
    io.emit('player_equipment_changed', { id: player.id, equipment: player.equipment });
  });
};

