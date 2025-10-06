export const gameState = {
  players: new Map(), // Stores player data, keyed by playerId
};

export function addPlayer(playerId, data) {
  gameState.players.set(playerId, data);
}

export function getPlayer(playerId) {
  return gameState.players.get(playerId);
}

export function removePlayerBySocketId(socketId) {
  let playerToRemove = null;
  for (const [id, player] of gameState.players.entries()) {
    if (player.socketId === socketId) {
      playerToRemove = id;
      break;
    }
  }
  if (playerToRemove) {
    gameState.players.delete(playerToRemove);
  }
}

export function updatePlayerState(playerId, newData) {
    if (gameState.players.has(playerId)) {
        const player = gameState.players.get(playerId);
        // Merge new data into the existing player object
        gameState.players.set(playerId, { ...player, ...newData });
    }
}
