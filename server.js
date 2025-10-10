// server.js — Express + Native WebSockets (ws)

const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);

// --- תצורה ---
const PORT = process.env.PORT || 8080;
const allowedOrigins = [
  'https://touch-world-server.onrender.com',
  'https://touch-world.io',
  'http://localhost:5173',
  'http://localhost:8081',
];

// --- Middleware ---
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  })
);

// --- State (In-Memory) ---
const players = {}; // אובייקט לאחסון שחקנים לפי ID
const areaSockets = {}; // אובייקט לאחסון סוקטים לפי אזור

// --- Health Check Endpoint ---
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Touch World WebSocket Server is running.',
    connected_players_count: Object.keys(players).length,
    areas: Object.keys(areaSockets).map(area => ({ area, count: areaSockets[area].size })),
  });
});

// --- WebSocket Server ---
const wss = new WebSocketServer({ server });

// --- Helper Functions ---
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

function safePlayerView(p) {
  if (!p || !p.username) return null;
  return {
    id: p.id,
    username: p.username,
    position_x: p.position_x,
    position_y: p.position_y,
    direction: p.direction,
    animation_frame: p.animation_frame,
    is_moving: p.is_moving,
    skin_code: p.skin_code,
    area: p.area,
    equipment: p.equipment || {},
  };
}

function broadcast(area, message, excludeId = null) {
    if (!areaSockets[area]) return;
    const stringifiedMessage = JSON.stringify(message);
    areaSockets[area].forEach(client => {
        if (client.id !== excludeId && client.readyState === client.OPEN) {
            client.send(stringifiedMessage);
        }
    });
}

function broadcastToAll(area, message) {
    if (!areaSockets[area]) return;
    const stringifiedMessage = JSON.stringify(message);
     areaSockets[area].forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(stringifiedMessage);
        }
    });
}


// --- WebSocket Logic ---
wss.on('connection', (ws) => {
  ws.id = generateId();
  console.log(`[+] Player connected: ${ws.id}`);

  // Initial player state
  players[ws.id] = {
    id: ws.id,
    username: '', // Will be set by client
    position_x: 600,
    position_y: 400,
    direction: 'front',
    animation_frame: 'idle',
    is_moving: false,
    area: 'city',
    skin_code: 'blue',
    equipment: {},
  };
  ws.area = 'city';

  // Add to area set
  if (!areaSockets[ws.area]) {
    areaSockets[ws.area] = new Set();
  }
  areaSockets[ws.area].add(ws);

  // Send current players in the area to the new client
  const currentPlayersInArea = Object.values(players)
    .filter(p => p.area === ws.area && p.id !== ws.id)
    .map(safePlayerView)
    .filter(Boolean);
    
  ws.send(JSON.stringify({ type: 'current_players', payload: currentPlayersInArea }));

  ws.on('message', (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage);
      const player = players[ws.id];
      if (!player) return;

      switch (message.type) {
        case 'player_update': {
          const hadUsername = !!player.username;
          Object.assign(player, message.payload); // Merge updates
          
          const view = safePlayerView(player);
          if (!view) return;

          // If username was just set, broadcast 'player_joined'
          if (!hadUsername && player.username) {
            console.log(`[+] Player ${ws.id} identified as ${player.username}`);
            broadcastToAll(ws.area, { type: 'player_joined', payload: view });
          } else {
            // Otherwise, it's a movement update
            broadcastToAll(ws.area, { type: 'player_moved', payload: view });
          }
          break;
        }
        
        case 'area_change': {
            const newArea = message.payload.area;
            if (newArea === ws.area) return;

            // Notify old area
            broadcast(ws.area, { type: 'player_left', payload: { playerId: ws.id } });
            areaSockets[ws.area]?.delete(ws);

            // Update state
            player.area = newArea;
            ws.area = newArea;

            // Join new area
            if (!areaSockets[newArea]) areaSockets[newArea] = new Set();
            areaSockets[newArea].add(ws);
            
            // Notify new area
            broadcast(newArea, { type: 'player_joined', payload: safePlayerView(player) }, ws.id);

            // Send new area's player list to the client
            const playersInNewArea = Object.values(players)
                .filter(p => p.area === newArea && p.id !== ws.id)
                .map(safePlayerView)
                .filter(Boolean);
            ws.send(JSON.stringify({ type: 'current_players', payload: playersInNewArea }));
            break;
        }

        case 'chat_message':
          broadcastToAll(ws.area, {
            type: 'bubble_message',
            payload: {
              playerId: ws.id,
              ...message.payload,
            },
          });
          break;
        
        case 'equipment_change':
            player.equipment = message.payload.equipment;
            broadcastToAll(ws.area, {
                type: 'player_equipment_changed',
                payload: { id: ws.id, equipment: player.equipment }
            });
            break;

        // Handle trade and other events similarly
      }
    } catch (error) {
      console.error('Failed to process message:', error);
    }
  });

  ws.on('close', () => {
    console.log(`[-] Player disconnected: ${ws.id}`);
    const player = players[ws.id];
    if (player && areaSockets[player.area]) {
      areaSockets[player.area].delete(ws);
      broadcast(player.area, { type: 'player_left', payload: { playerId: ws.id } });
    }
    delete players[ws.id];
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for ${ws.id}:`, error);
  });
});

// --- Start Server ---
server.listen(PORT, () => {
  console.log(`Touch World Server (WebSocket) listening on port ${PORT}`);
});
