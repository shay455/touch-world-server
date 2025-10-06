import { Logger } from '../utils/logger.js';

export function setupChatHandlers(socket, io) {
  socket.on('bubbleMessage', (data) => {
    const player = gameState.players.get(data.playerId);
    if (player && player.areaId) {
      Logger.chat(`[${player.areaId}] ${data.username}: ${data.message}`);
      socket.to(player.areaId).emit('bubbleMessage', data);
    }
  });
}
