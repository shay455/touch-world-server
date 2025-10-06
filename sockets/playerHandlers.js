import { gameState } from '../state/gameState.js';
import { Logger } from '../utils/logger.js';

export function setupPlayerHandlers(socket, io) {
  const { playerId, areaId } = socket.handshake.query;

  if (!playerId || !areaId) {
    Logger.error('Connection rejected: Missing playerId or areaId in query');
    socket.disconnect(true);
    return;
  }

  const initialPlayerData = {
    socketId: socket.id,
    id: playerId,
    areaId: areaId,
    username: 'שחקן',
    x: 960,
    y: 540,
    direction: 'front',
    joinedAt: Date.now(),
  };

  gameState.players.set(playerId, initialPlayerData);
  socket.join(areaId);
  Logger.info(`Player ${playerId} joined area ${areaId}`);

  socket.on('playerState', (playerData) => {
    const player = gameState.players.get(playerId);
    if (player) {
      Object.assign(player, playerData);
      socket.to(areaId).emit('playersUpdate', {
        players: [player]
      });
    }
  });

  socket.on('itemUpdate', () => {
    Logger.info('Broadcasting itemDesignsUpdated to all clients.');
    io.emit('itemDesignsUpdated');
  });
}
