import { getPlayer, updatePlayerState } from './gameState.js';
import { Logger } from './logger.js';

export function setupEventHandlers(socket, io) {
    const playerId = socket.handshake.query.playerId;

    // Main player state sync
    socket.on('playerState', (playerData) => {
        const player = getPlayer(playerId);
        if (player) {
            updatePlayerState(playerId, playerData);
        }
    });

    // Chat bubble messages
    socket.on('bubbleMessage', (data) => {
        const player = getPlayer(data.playerId);
        if (player && player.areaId) {
            Logger.chat(`[${player.areaId}] ${data.username}: ${data.message}`);
            // Broadcast to everyone else in the same area
            socket.to(player.areaId).emit('bubbleMessage', data);
        }
    });

    // Trade initiation and updates
    socket.on('tradeRequest', (tradeId, initiatorId, receiverId) => {
        const receiver = getPlayer(receiverId);
        if (receiver) {
            io.to(receiver.socketId).emit('tradeRequest', { tradeId, initiatorId });
        }
    });

    socket.on('tradeUpdate', (tradeId, status, targetPlayerId) => {
        const target = getPlayer(targetPlayerId);
        if (target) {
            io.to(target.socketId).emit('tradeUpdate', { tradeId, status });
        }
    });

    // Event when item designs are updated in the admin panel
    socket.on('itemUpdate', () => {
        Logger.info('Received itemUpdate event, broadcasting to all clients.');
        io.emit('itemDesignsUpdated'); // Broadcast to ALL connected clients
    });
}
