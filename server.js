import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { corsOptions } from './config/cors.js';
import { gameState, removePlayer } from './state/gameState.js';
import { setupPlayerHandlers } from './sockets/playerHandlers.js';
import { setupChatHandlers } from './sockets/chatHandlers.js';
import { setupTradeHandlers } from './sockets/tradeHandlers.js';
import { handleApiRoutes } from './routes/apiRoutes.js';
import { Logger } from './utils/logger.js';

const PORT = process.env.PORT || 3000;

const httpServer = createServer((req, res) => {
    handleApiRoutes(req, res, gameState);
});

const io = new Server(httpServer, {
    cors: corsOptions,
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

io.on('connection', (socket) => {
    Logger.connection('NEW CONNECTION', { socketId: socket.id, total: io.engine.clientsCount });

    setupPlayerHandlers(socket, io);
    setupChatHandlers(socket, io);
    setupTradeHandlers(socket, io);

    socket.on('disconnect', (reason) => {
        let disconnectedPlayer = null;
        for (const [playerId, player] of gameState.players.entries()) {
            if (player.socketId === socket.id) {
                disconnectedPlayer = player;
                socket.to(player.areaId).emit('playerLeft', { playerId });
                removePlayer(playerId);
                break;
            }
        }
        if (disconnectedPlayer) {
            const duration = Math.round((Date.now() - disconnectedPlayer.joinedAt) / 1000);
            Logger.connection('DISCONNECT', { 
                user: disconnectedPlayer.username, 
                reason, 
                duration: `${duration}s`,
                remaining: gameState.players.size 
            });
        }
    });
});

setInterval(() => {
    const areaStats = {};
    for (const player of gameState.players.values()) {
        areaStats[player.areaId] = (areaStats[player.areaId] || 0) + 1;
    }
    Logger.stats('PERIODIC STATS', { 
        players: gameState.players.size, 
        trades: gameState.trades.size,
        areas: areaStats 
    });
}, 300000);

httpServer.listen(PORT, () => {
    console.log(`\n\x1b[36mSERVER ONLINE on port ${PORT}\x1b[0m\n`);
    Logger.success('Server started successfully');
});

export { io, httpServer };
