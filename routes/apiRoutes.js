import { Logger } from '../utils/logger.js';

export function handleApiRoutes(req, res, gameState) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/health' && req.method === 'GET') {
    res.statusCode = 200;
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  if (req.url === '/stats' && req.method === 'GET') {
    const areaStats = {};
    for (const player of gameState.players.values()) {
        areaStats[player.areaId] = (areaStats[player.areaId] || 0) + 1;
    }

    res.statusCode = 200;
    res.end(JSON.stringify({
      connected_players: gameState.players.size,
      active_trades: gameState.trades.size,
      players_by_area: areaStats,
    }));
    return;
  }
  
  if (req.url === '/' && req.method === 'GET') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.end('<h1>Touch World Server is Running!</h1>');
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not Found' }));
  Logger.warn(`404 - Not Found: ${req.method} ${req.url}`);
}
