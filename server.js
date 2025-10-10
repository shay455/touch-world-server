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
    areas: Object.keys(areaSockets).map(area => ({ area, count: areaSockets[area] ? areaSockets[area].size : 0 })),
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

function broadcastToArea(area, message) {
    if (!areaSockets[area]) return;
    const stringifiedMessage = JSON.stringify(message);
    areaSockets[area].forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(stringifiedMessage);
        }
    });
}

function getPlayersInArea(area) {
    const playersInArea = {};
    if (areaSockets[area]) {
        areaSockets[area].forEach(client => {
            const p = players[client.id];
            if (p) {
                const view = safePlayerView(p);
                if (view) {
                    playersInArea[p.id] = view;
                }
            }
        });
    }
    return playersInArea;
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
  
  // Send the new player their ID
  ws.send(JSON.stringify({ type: 'welcome', payload: { id: ws.id } }));

  // Send current players in the area to the new player
  ws.send(JSON.stringify({ type: 'current_players', payload: { players: getPlayersInArea(ws.area) } }));

  ws.on('message', (message) => {
    try {
      const { type, payload } = JSON.parse(message);
      const player = players[ws.id];
      if (!player) return;

      switch (type) {
        case 'player_update':
          const hadUsername = !!player.username;
          Object.assign(player, payload); // Update server state

          const view = safePlayerView(player);
          if (view) {
             if (!hadUsername && player.username) {
                console.log(`[+] Player ${ws.id} is now identified as ${player.username}`);
                broadcastToArea(ws.area, { type: 'player_joined', payload: { player: view } });
             } else {
                broadcastToArea(ws.area, { type: 'player_moved', payload: { player: view } });
             }
          }
          break;

        case 'chat_message':
            broadcastToArea(ws.area, { type: 'new_chat_message', payload: { 
              playerId: ws.id,
              username: payload.username,
              message: payload.message,
              adminLevel: payload.adminLevel
            }});
            break;
            
        case 'equipment_change':
             if (payload.equipment) {
                player.equipment = payload.equipment;
                broadcastToArea(ws.area, { type: 'player_equipment_changed', payload: { id: ws.id, equipment: player.equipment } });
            }
            break;

        case 'area_change':
          const newArea = payload.area;
          if (newArea && ws.area !== newArea) {
            // Remove from old area
            if(areaSockets[ws.area]) {
                areaSockets[ws.area].delete(ws);
            }
            broadcastToArea(ws.area, { type: 'player_disconnected', payload: { playerId: ws.id } });

            // Add to new area
            ws.area = newArea;
            player.area = newArea;
            if (!areaSockets[newArea]) {
              areaSockets[newArea] = new Set();
            }
            areaSockets[newArea].add(ws);

            // Send new area's player list to the client
            ws.send(JSON.stringify({ type: 'current_players', payload: { players: getPlayersInArea(newArea) } }));
            
            // Announce arrival in new area
            const playerView = safePlayerView(player);
            if(playerView){
                broadcastToArea(newArea, { type: 'player_joined', payload: { player: playerView } });
            }
          }
          break;
      }
    } catch (error) {
      console.error(`Error processing message from ${ws.id}:`, error);
    }
  });

  ws.on('close', () => {
    console.log(`[-] Player disconnected: ${ws.id}`);
    const playerArea = players[ws.id]?.area;
    if (playerArea && areaSockets[playerArea]) {
        areaSockets[playerArea].delete(ws);
        if (areaSockets[playerArea].size === 0) {
            delete areaSockets[playerArea];
        }
    }
    delete players[ws.id];
    broadcastToArea(playerArea, { type: 'player_disconnected', payload: { playerId: ws.id } });
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error from ${ws.id}:`, error);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Touch World Server listening on port ${PORT}`);
});
