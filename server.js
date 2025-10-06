import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

// ═══════════════════════════════════════════════════════════
// 🎮 TOUCH WORLD MULTIPLAYER SERVER v2.7
// FIXED: Single Source of Truth (BodySkinConfig Only!)
// ═══════════════════════════════════════════════════════════

const PORT = process.env.PORT || 10000;
const app = express();
const httpServer = createServer(app);

console.log('🚀 Touch World Server v2.7 Starting...');

// CORS
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://preview--copy-565f73e8.base44.app',
    'https://base44.app',
    'https://touch-world.io',
    'https://www.touch-world.io',
    /\.base44\.app$/,
    /\.touch-world\.io$/,
    /\.onrender\.com$/
];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const isAllowed = allowedOrigins.some(allowed => 
            typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
        );
        callback(null, isAllowed);
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS']
};

app.use(cors(corsOptions));
app.use(express.json());

// Socket.IO
const io = new Server(httpServer, {
    cors: corsOptions,
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e8,
    connectTimeout: 45000
});

// Game State
const gameState = {
    players: new Map(),
    startTime: Date.now(),
    stats: { totalConnections: 0, totalMessages: 0, peakPlayers: 0 }
};

// Get Full Player Data
function getFullPlayerData(player) {
    return {
        id: player.id,
        username: player.username,
        position_x: player.position_x ?? 600,
        position_y: player.position_y ?? 400,
        direction: player.direction ?? 'front',
        is_moving: player.is_moving ?? false,
        animation_frame: player.animation_frame ?? 'idle',
        velocity_x: player.velocity_x ?? 0,
        velocity_y: player.velocity_y ?? 0,
        skin_code: player.skin_code,
        equipped_hair: player.equipped_hair,
        equipped_top: player.equipped_top,
        equipped_pants: player.equipped_pants,
        equipped_hat: player.equipped_hat,
        equipped_halo: player.equipped_halo,
        equipped_necklace: player.equipped_necklace,
        equipped_accessories: player.equipped_accessories || [],
        equipped_shoes: player.equipped_shoes,
        equipped_gloves: player.equipped_gloves,
        admin_level: player.admin_level || 'user',
        is_invisible: player.is_invisible || false,
        isAfk: player.isAfk || false
    };
}

// Get Room Players
function getRoomPlayers(roomId) {
    const players = [];
    for (const [id, player] of gameState.players.entries()) {
        if (player.roomId === roomId && !player.is_invisible) {
            players.push(getFullPlayerData(player));
        }
    }
    return players;
}

// Home Page
app.get('/', (req, res) => {
    const uptime = Math.floor((Date.now() - gameState.startTime) / 1000);
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = uptime % 60;

    const areaStats = {};
    for (const p of gameState.players.values()) {
        if (!p.is_invisible) areaStats[p.roomId] = (areaStats[p.roomId] || 0) + 1;
    }

    res.send(`<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="UTF-8"><title>Touch World Server</title>
<meta http-equiv="refresh" content="5">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;padding:20px;color:#fff}
.c{max-width:1200px;margin:0 auto}
h1{text-align:center;font-size:3em;margin-bottom:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px;margin:20px 0}
.card{background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);border-radius:15px;padding:20px;border:1px solid rgba(255,255,255,0.2)}
.big{font-size:2.5em;font-weight:bold;margin-bottom:5px}
.status{display:inline-block;width:10px;height:10px;background:#00ff00;border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
</style>
</head>
<body>
<div class="c">
<h1>🎮 Touch World Server v2.7</h1>
<div style="text-align:center;margin:20px 0">
<span class="status"></span> Server Online
</div>
<div class="grid">
<div class="card"><div class="big">${gameState.players.size}</div>👥 שחקנים מחוברים</div>
<div class="card"><div class="big">${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}</div>⏱️ זמן פעילות</div>
<div class="card"><div class="big">${gameState.stats.peakPlayers}</div>📊 שיא שחקנים</div>
<div class="card"><div class="big">${gameState.stats.totalConnections}</div>📈 חיבורים כוללים</div>
</div>
<div class="card"><h3>🗺️ שחקנים באזורים:</h3>
${Object.entries(areaStats).map(([area, count]) => `<div>${area}: ${count}</div>`).join('')}
</div>
</div>
</body>
</html>`);
});

// Health
app.get('/health', (req, res) => {
    res.json({ status: 'ok', players: gameState.players.size, version: '2.7' });
});

// Socket Events
io.on('connection', (socket) => {
    console.log('✅ Connected:', socket.id);
    gameState.stats.totalConnections++;

    socket.on('join', (data) => {
        try {
            const { playerId, areaId, playerData } = data;
            console.log(`👤 ${playerData.username} joining ${areaId} with skin: ${playerData.skin_code}`);

            const currentPlayer = gameState.players.get(playerId);
            if (currentPlayer?.roomId) {
                socket.leave(`area_${currentPlayer.roomId}`);
                socket.to(`area_${currentPlayer.roomId}`).emit('playerLeft', { playerId });
            }

            socket.join(`area_${areaId}`);
            
            gameState.players.set(playerId, {
                id: playerId,
                socketId: socket.id,
                roomId: areaId,
                username: playerData.username,
                position_x: playerData.position_x || 600,
                position_y: playerData.position_y || 400,
                direction: playerData.direction || 'front',
                is_moving: false,
                animation_frame: 'idle',
                velocity_x: 0,
                velocity_y: 0,
                skin_code: playerData.skin_code,
                equipped_hair: playerData.equipped_hair,
                equipped_top: playerData.equipped_top,
                equipped_pants: playerData.equipped_pants,
                equipped_hat: playerData.equipped_hat,
                equipped_halo: playerData.equipped_halo,
                equipped_necklace: playerData.equipped_necklace,
                equipped_accessories: playerData.equipped_accessories || [],
                equipped_shoes: playerData.equipped_shoes,
                equipped_gloves: playerData.equipped_gloves,
                admin_level: playerData.admin_level || 'user',
                is_invisible: playerData.is_invisible || false,
                isAfk: false,
                lastUpdate: Date.now()
            });

            if (gameState.players.size > gameState.stats.peakPlayers) {
                gameState.stats.peakPlayers = gameState.players.size;
            }

            const roomPlayers = getRoomPlayers(areaId);
            socket.emit('playersUpdate', { players: roomPlayers });
            socket.to(`area_${areaId}`).emit('playerJoined', getFullPlayerData(gameState.players.get(playerId)));
            
            console.log(`✅ ${playerData.username} joined (${roomPlayers.length} players in room)`);
        } catch (error) {
            console.error('❌ Join error:', error);
        }
    });

    socket.on('playerState', (data) => {
        const player = gameState.players.get(data.id);
        if (player) {
            player.position_x = data.position_x;
            player.position_y = data.position_y;
            player.direction = data.direction;
            player.is_moving = data.is_moving;
            player.animation_frame = data.animation_frame;
            player.velocity_x = data.velocity_x || 0;
            player.velocity_y = data.velocity_y || 0;
            player.lastUpdate = Date.now();
            
            socket.to(`area_${player.roomId}`).emit('playerStateUpdate', {
                id: data.id,
                position_x: data.position_x,
                position_y: data.position_y,
                direction: data.direction,
                is_moving: data.is_moving,
                animation_frame: data.animation_frame,
                velocity_x: data.velocity_x,
                velocity_y: data.velocity_y
            });
        }
    });

    socket.on('playerAppearanceChange', (data) => {
        const player = gameState.players.get(data.playerId);
        if (player) {
            console.log(`👗 Appearance change: ${player.username} - skin: ${data.skin_code}`);
            player.skin_code = data.skin_code || player.skin_code;
            player.equipped_hair = data.equipped_hair !== undefined ? data.equipped_hair : player.equipped_hair;
            player.equipped_top = data.equipped_top !== undefined ? data.equipped_top : player.equipped_top;
            player.equipped_pants = data.equipped_pants !== undefined ? data.equipped_pants : player.equipped_pants;
            player.equipped_hat = data.equipped_hat !== undefined ? data.equipped_hat : player.equipped_hat;
            player.equipped_halo = data.equipped_halo !== undefined ? data.equipped_halo : player.equipped_halo;
            player.equipped_necklace = data.equipped_necklace !== undefined ? data.equipped_necklace : player.equipped_necklace;
            player.equipped_accessories = data.equipped_accessories || player.equipped_accessories;
            player.equipped_shoes = data.equipped_shoes !== undefined ? data.equipped_shoes : player.equipped_shoes;
            player.equipped_gloves = data.equipped_gloves !== undefined ? data.equipped_gloves : player.equipped_gloves;
            
            io.to(`area_${player.roomId}`).emit('playerAppearanceUpdate', getFullPlayerData(player));
        }
    });

    socket.on('bubbleMessage', (data) => {
        const player = gameState.players.get(data.playerId);
        if (player) {
            player.bubbleMessage = data.message;
            player.bubbleTimestamp = Date.now();
            io.to(`area_${player.roomId}`).emit('bubbleMessage', {
                playerId: data.playerId,
                message: data.message,
                username: data.username,
                adminLevel: data.adminLevel || 'user',
                timestamp: Date.now()
            });
            gameState.stats.totalMessages++;
        }
    });

    socket.on('playerAfk', (data) => {
        const player = gameState.players.get(data.playerId);
        if (player) {
            player.isAfk = data.isAfk;
            io.to(`area_${player.roomId}`).emit('playerAfkUpdate', { playerId: data.playerId, isAfk: data.isAfk });
        }
    });

    socket.on('tradeRequest', (data) => {
        const receiver = gameState.players.get(data.receiverId);
        if (receiver) io.to(receiver.socketId).emit('tradeRequest', data);
    });

    socket.on('tradeUpdate', (data) => {
        io.emit('tradeUpdate', data);
    });

    socket.on('disconnect', () => {
        for (const [playerId, player] of gameState.players.entries()) {
            if (player.socketId === socket.id) {
                gameState.players.delete(playerId);
                io.to(`area_${player.roomId}`).emit('playerLeft', { playerId });
                console.log(`👋 ${player.username} left`);
                break;
            }
        }
    });
});

// Cleanup
setInterval(() => {
    const now = Date.now();
    const timeout = 5 * 60 * 1000;
    let cleaned = 0;
    
    for (const [playerId, player] of gameState.players.entries()) {
        if (now - player.lastUpdate > timeout) {
            gameState.players.delete(playerId);
            io.to(`area_${player.roomId}`).emit('playerLeft', { playerId });
            cleaned++;
        }
    }
    
    if (cleaned > 0) console.log(`🧹 Cleaned ${cleaned} inactive players`);
}, 30000);

// Start
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════');
    console.log('🎮 TOUCH WORLD SERVER v2.7 - RUNNING');
    console.log(`🚀 Port: ${PORT}`);
    console.log('✅ Single Source of Truth (BodySkinConfig)');
    console.log('═══════════════════════════════════════');
});

export default httpServer;
