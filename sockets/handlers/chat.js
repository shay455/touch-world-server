const { players } = require('../../core/players');

module.exports = function registerChatHandlers(io, socket) {
  socket.on('chat_message', (chatData = {}) => {
    const p = players[socket.id];
    if (!p || !p.ready) return;

    const username = chatData.username || p.username || 'Unknown';
    const message  = chatData.message  || '';

    console.log(`[CHAT][${p.current_area}] ${username}: ${message}`);

    // שידור לכלל (אפשר להחליף ל-room לפי אזור אם תרצה)
    io.emit('new_chat_message', {
      playerId: socket.id,
      message,
      username,
      adminLevel: chatData.adminLevel || p.admin_level || 'user',
      timestamp: Date.now()
    });
  });
};
