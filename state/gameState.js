export const gameState = {
  players: new Map(), // Stores player data, keyed by playerId
  trades: new Map()   // Stores active trades, keyed by tradeId
};

export function removePlayer(playerId) {
  if (gameState.players.has(playerId)) {
    gameState.players.delete(playerId);
  }
}
