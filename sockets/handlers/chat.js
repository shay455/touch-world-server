// sockets/handlers/chat.js
module.exports = (io, socket, players) => {
  socket.on('chat_message', (chatData = {}) => {
    const player = players[socket.id];
    if (!player) return;
    const username = chatData.username || player.username || 'Unknown';
    const message = chatData.message || '';
    io.emit('new_chat_message', {
      playerId: socket.id,
      message,
      username,
      adminLevel: chatData.adminLevel || 'user',
      timestamp: Date.now()
    });
  });
};

