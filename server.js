import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { corsOptions } from './cors.js';
import { gameState, addPlayer, getPlayer, removePlayerBySocketId } from './gameState.js';
import { setupEventHandlers } from './handlers.js';
import { Logger } from './logger.js';

const PORT = process.env.PORT || 3001;

const httpServer = createServer((req, res) => {
    // Basic health check for Render
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', players: gameState.players.size }));
    } else {
        res.writeHead(404);
        res.end();
    }
});

const io = new Server(httpServer, {
    cors: corsOptions,
    pingTimeout: 60000,
    pingInterval: 25000,
});

io.on('connection', (socket) => {
    const { playerId, areaId } = socket.handshake.query;

    if (!playerId || !areaId) {
        Logger.error('Connection Rejected: Missing playerId or areaId.');
        socket.disconnect(true);
        return;
    }

    Logger.connection(`New Connection -> Player: ${playerId}, Area: ${areaId}`);
    
    addPlayer(playerId, { socketId: socket.id, id: playerId, areaId: areaId, joinedAt: Date.now() });
    socket.join(areaId);

    setupEventHandlers(socket, io);

    socket.on('disconnect', (reason) => {
        const disconnectedPlayer = getPlayer(playerId);
        if (disconnectedPlayer) {
            socket.to(disconnectedPlayer.areaId).emit('playerLeft', { playerId: disconnectedPlayer.id });
            const duration = Math.round((Date.now() - disconnectedPlayer.joinedAt) / 1000);
            Logger.connection(`Player Disconnected: ${disconnectedPlayer.username || playerId} after ${duration}s. Reason: ${reason}`);
        }
        removePlayerBySocketId(socket.id);
    });
});

// Main game loop for broadcasting state
setInterval(() => {
    const areas = [...new Set(Array.from(gameState.players.values()).map(p => p.areaId))];
    areas.forEach(areaId => {
        const playersInArea = Array.from(gameState.players.values()).filter(p => p.areaId === areaId);
        if (playersInArea.length > 0) {
            io.to(areaId).emit('playersUpdate', { players: playersInArea });
        }
    });
}, 100); // 10 FPS update rate

httpServer.listen(PORT, () => {
    Logger.success(`Touch World Server is online and listening on port ${PORT}`);
});
