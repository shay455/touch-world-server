// sockets/index.js
const players = require('../core/players');
const registerPlayerHandlers = require('./handlers/player');
const registerChatHandlers   = require('./handlers/chat');
const registerTradeHandlers  = require('./handlers/trade');

module.exports = function attachSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);

    // צור שחקן ברירת מחדל בחיבור
    players.store[socket.id] = players.createDefaultPlayer(socket.id);

    // שלח למתחבר את כל השחקנים הקיימים (כולל כאלה שעדיין לא העבירו identify)
    const snapshot = {};
    for (const [pid, pdata] of Object.entries(players.store)) {
      snapshot[pid] = players.safeView(pdata);
    }
    socket.emit('current_players', snapshot);

    // עדכן את השאר שיש שחקן חדש (עם ה-view גם אם username ריק)
    socket.broadcast.emit('player_joined', players.safeView(players.store[socket.id]));

    // הרשמה להנדלרים
    registerPlayerHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerTradeHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log(`[-] Player disconnected: ${socket.id}`);
      delete players.store[socket.id];
      io.emit('player_disconnected', socket.id);
    });
  });
};
