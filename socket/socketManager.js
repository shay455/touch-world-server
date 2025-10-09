import GameManager from '../game/gameManager.js';

// This map will store player ID to socket ID for direct messaging
const playerSockets = new Map();

export default function initializeSocketManager(io) {
  const gameManager = new GameManager(io);

  io.on('connection', (socket) => {
    console.log(`✨ New connection: ${socket.id}`);

    // Event to join a game area
    socket.on('joinArea', ({ playerId, areaId, gameSessionId }) => {
      if (!playerId || !areaId) {
        console.warn(`Invalid joinArea request from ${socket.id}`);
        return;
      }
      console.log(`[${areaId}] Player ${playerId} is joining.`);
      gameManager.addPlayerToArea(socket, playerId, areaId);
      playerSockets.set(playerId, socket.id);
    });

    // Event for player state updates (movement, animation, etc.)
    socket.on('playerStateUpdate', (playerState) => {
      const areaId = gameManager.getPlayerArea(socket.id);
      if (areaId && playerState) {
        gameManager.updatePlayerState(areaId, playerState);
      }
    });

    // Event for chat bubble messages
    socket.on('bubbleMessage', (data) => {
        const areaId = gameManager.getPlayerArea(socket.id);
        if (areaId && data) {
            // Broadcast to everyone else in the same area
            socket.to(areaId).emit('bubbleMessage', data);
        }
    });
    
    // --- Trade Events ---
    socket.on('tradeRequest', (data) => {
        const receiverSocketId = playerSockets.get(data.receiver_id);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('tradeRequest', data);
        }
    });
    
    socket.on('tradeUpdate', (data) => {
        const initiatorSocket = playerSockets.get(data.initiator_id);
        const receiverSocket = playerSockets.get(data.receiver_id);
        
        if (initiatorSocket) io.to(initiatorSocket).emit('tradeUpdate', data);
        if (receiverSocket) io.to(receiverSocket).emit('tradeUpdate', data);
    });

    // Event for when a player disconnects
    socket.on('disconnect', (reason) => {
      console.log(`🔌 Player disconnected: ${socket.id}. Reason: ${reason}`);
      const playerId = gameManager.getPlayerIdBySocketId(socket.id);
      if (playerId) {
          playerSockets.delete(playerId);
      }
      gameManager.removePlayerFromArea(socket);
    });
  });
}
