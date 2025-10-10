// sockets/index.js
const registerPlayerEvents = require('./handlers/player');
const registerChatEvents = require('./handlers/chat');
const registerTradeEvents = require('./handlers/trade');

module.exports = (io, players, createDefaultPlayer, safePlayerView, mergeRuntimeUpdate) => {
  io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);

    // יצירת שחקן חדש
    players[socket.id] = createDefaultPlayer(socket.id);

    // שלח את כל השחקנים הקיימים למתחבר
    socket.emit('current_players', players);

    // עדכן את כל השאר על שחקן חדש
    socket.broadcast.emit('player_joined', safePlayerView(players[socket.id]));

    // רישום אירועים
    registerPlayerEvents(io, socket, players, safePlayerView, mergeRuntimeUpdate);
    registerChatEvents(io, socket, players);
    registerTradeEvents(io, socket, players);

    // ניתוק
    socket.on('disconnect', () => {
      console.log(`[-] Player disconnected: ${socket.id}`);
      delete players[socket.id];
      io.emit('player_disconnected', socket.id);
    });
  });
};

