// sockets/handlers/chat.js
const players = require('../../core/players');

module.exports = function registerChatHandlers(io, socket) {
  socket.on('chat_message', (chatData = {}) => {
    const p = players.store[socket.id];
    if (!p) return;

    const username = chatData.username || p.username || 'Unknown';
    const message  = chatData.message  || '';

    console.log(`[CHAT][${p.current_area}] ${username}: ${message}`);

    // משדרים לכולם (לא שומרים היסטוריה)
    io.emit('new_chat_message', {
      playerId: socket.id,
      message,
      username,
      adminLevel: chatData.adminLevel || p.admin_level || 'user',
      timestamp: Date.now(),
    });
  });
};
