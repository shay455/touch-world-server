import { gameState } from '../state/gameState.js';
import { Logger } from '../utils/logger.js';

export function setupTradeHandlers(socket, io) {
  socket.on('tradeRequest', ({ tradeId, initiatorId, receiverId }) => {
    const receiver = gameState.players.get(receiverId);
    if (receiver && receiver.socketId) {
      Logger.trade(`Trade request from ${initiatorId} to ${receiverId} (Trade ID: ${tradeId})`);
      io.to(receiver.socketId).emit('tradeRequest', { tradeId, initiator_id: initiatorId });
    }
  });

  socket.on('tradeUpdate', ({ tradeId, status, targetPlayerId }) => {
    const target = gameState.players.get(targetPlayerId);
    if (target && target.socketId) {
      Logger.trade(`Trade update for ${tradeId}: status=${status}, target=${targetPlayerId}`);
      io.to(target.socketId).emit('tradeUpdate', { tradeId, status });
    } else {
      io.emit('tradeUpdate', { tradeId, status });
    }
  });
}
