// מחבר את כל ה-handlers לאירוע connection

const { players, makeDefaultPlayer, safePlayerView } = require('../core/players');
const registerPlayerHandlers = require('./handlers/player');
const registerChatHandlers = require('./handlers/chat');
const registerTradeHandlers = require('./handlers/trade');

module.exports = function attachSockets(io) {
  io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);

    // צור שחקן בסיסי אך ready=false — לא משדרים אותו לשאר עד identify
    players[socket.id] = makeDefaultPlayer(socket.id);

    // שלח ללקוח החדש snapshot של שחקנים שכבר ready
    const snapshot = {};
    for (const [pid, pdata] of Object.entries(players)) {
      if (pdata.ready) snapshot[pid] = safePlayerView(pdata);
    }
    socket.emit('current_players', snapshot);

    // רישום כל ההנדלרים לפלייר/צ׳אט/טרייד
    registerPlayerHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerTradeHandlers(io, socket);
  });
};
