import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

// ═══════════════════════════════════════════════════════════
// 🎮 TOUCH WORLD MULTIPLAYER SERVER v2.6
// Full Synchronization - Working Version
// ═══════════════════════════════════════════════════════════

const PORT = process.env.PORT || 10000;
const app = express();
const httpServer = createServer(app);

console.log('🚀 Starting Touch World Server...');
console.log('📍 Port:', PORT);

// 🔓 CORS Configuration
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

// 🎮 Socket.IO
const io = new Server(httpServer, {
    cors: corsOptions,
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e8,
    connectTimeout: 45000,
    allowEIO3: true
});

// 📊 Game State
const gameState = {
    players: new Map(),
    startTime: Date.now(),
    stats: {
        totalConnections: 0,
        totalMessages: 0,
        peakPlayers: 0
    }
};

// 🔧 Get Full Player Data
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

// 🔧 Get Room Players
function getRoomPlayers(roomId) {
    const players = [];
    for (const [id, player] of gameState.players.entries()) {
        if (player.roomId === roomId && !player.is_invisible) {
            players.push(getFullPlayerData(player));
        }
    }
    return players;
}

// 🏠 Home Page
app.get('/', (req, res) => {
    const uptime = Math.floor((Date.now() - gameState.startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    const areaStats = {};
    const playersList = [];
    
    for (const player of gameState.players.values()) {
        if (!player.is_invisible) {
            areaStats[player.roomId] = (areaStats[player.roomId] || 0) + 1;
            playersList.push({
                username: player.username,
                area: player.roomId,
                skin: player.skin_code
            });
        }
    }

    const areaNames = {
        'city': '🏙️ העיר',
        'dreams': '🌈 חלומות',
        'nightmares': '🌑 סיוטים',
        'arcade': '🎮 ארקייד'
    };

    const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎮 Touch World Server</title>
    <meta http-equiv="refresh" content="5">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            color: white;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header {
            text-align: center;
            margin-bottom: 40px;
            animation: fadeIn 0.8s;
        }
        .header h1 {
            font-size: 3em;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 25px;
            border-radius: 15px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            animation: slideUp 0.6s;
        }
        .stat-value {
            font-size: 2.5em;
            font-weight: bold;
            margin: 10px 0;
        }
        .stat-label {
            opacity: 0.8;
            font-size: 1.1em;
        }
        .players-section {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 25px;
            border-radius: 15px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            margin-bottom: 20px;
        }
        .players-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        .player-card {
            background: rgba(255, 255, 255, 0.15);
            padding: 15px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .area-badge {
            display: inline-block;
            padding: 5px 12px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 15px;
            font-size: 0.85em;
            margin-top: 8px;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            opacity: 0.7;
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .status-dot {
            width: 10px;
            height: 10px;
            background: #00ff00;
            border-radius: 50%;
            display: inline-block;
            animation: pulse 2s infinite;
            margin-left: 5px;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎮 Touch World Server</h1>
            <p style="font-size: 1.2em; opacity: 0.9;">
                <span class="status-dot"></span>
                שרת פעיל ורץ
            </p>
            <p style="opacity: 0.7; margin-top: 10px;">v2.6 - Real-time Multiplayer</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">👥 שחקנים מחוברים</div>
                <div class="stat-value">${gameState.players.size}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">⏱️ זמן פעילות</div>
                <div class="stat-value">${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">📊 שיא שחקנים</div>
                <div class="stat-value">${gameState.stats.peakPlayers}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">📨 סה"כ הודעות</div>
                <div class="stat-value">${gameState.stats.totalMessages}</div>
            </div>
        </div>

        ${Object.keys(areaStats).length > 0 ? `
        <div class="players-section">
            <h2 style="margin-bottom: 10px;">📍 שחקנים לפי אזורים</h2>
            <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-top: 15px;">
                ${Object.entries(areaStats).map(([area, count]) => `
                    <div style="background: rgba(255,255,255,0.15); padding: 15px 25px; border-radius: 10px;">
                        <div style="font-size: 1.5em;">${areaNames[area] || area}</div>
                        <div style="font-size: 2em; font-weight: bold;">${count}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}

        ${playersList.length > 0 ? `
        <div class="players-section">
            <h2>👤 שחקנים מחוברים (${playersList.length})</h2>
            <div class="players-list">
                ${playersList.map(p => `
                    <div class="player-card">
                        <div style="font-size: 1.2em; font-weight: bold; margin-bottom: 5px;">
                            ${p.username}
                        </div>
                        <div style="opacity: 0.8; font-size: 0.9em;">
                            צבע: ${p.skin || 'לא ידוע'}
                        </div>
                        <div class="area-badge">
                            ${areaNames[p.area] || p.area}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : `
        <div class="players-section" style="text-align: center; padding: 40px;">
            <div style="font-size: 3em; margin-bottom: 15px;">😴</div>
            <h3>אין שחקנים מחוברים כרגע</h3>
            <p style="opacity: 0.7; margin-top: 10px;">השרת ממתין לשחקנים...</p>
        </div>
        `}

        <div class="footer">
            <p>© 2025 Touch World - Real-time Multiplayer Server</p>
            <p style="margin-top: 10px; font-size: 0.9em;">
                🔄 הדף מתרענן אוטומטית כל 5 שניות
            </p>
        </div>
    </div>
</body>
</html>
    `;
    
    res.send(html);
});

// 🏥 Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.floor((Date.now() - gameState.startTime) / 1000),
        players: gameState.players.size,
        version: '2.6'
    });
});

// 📊 Stats
app.get('/stats', (req, res) => {
    const rooms = {};
    for (const player of gameState.players.values()) {
        rooms[player.roomId] = (rooms[player.roomId] || 0) + 1;
    }
    
    res.json({
        totalPlayers: gameState.players.size,
        rooms,
        uptime: Math.floor((Date.now() - gameState.startTime) / 1000),
        stats: gameState.stats
    });
});

// 🔌 Socket.IO Events
io.on('connection', (socket) => {
    console.log('✅ [CONNECTION] New player connected:', socket.id);
    gameState.stats.totalConnections++;

    // 👋 Join Room
    socket.on('join', (data) => {
        try {
            const { playerId, areaId, playerData } = data;
            
            console.log('═══════════════════════════════════════');
            console.log('👤 [JOIN] Player joining:', playerData.username);
            console.log('📍 Area:', areaId);
            console.log('👗 Appearance:', {
                skin: playerData.skin_code,
                hair: playerData.equipped_hair,
                top: playerData.equipped_top,
                pants: playerData.equipped_pants,
                hat: playerData.equipped_hat,
                accessories: playerData.equipped_accessories
            });
            console.log('═══════════════════════════════════════');

            // Leave previous room
            const currentPlayer = gameState.players.get(playerId);
            if (currentPlayer?.roomId) {
                const oldRoom = currentPlayer.roomId;
                socket.leave(`area_${oldRoom}`);
                socket.to(`area_${oldRoom}`).emit('playerLeft', { playerId });
                console.log(`🚪 [LEAVE] Left area: ${oldRoom}`);
            }

            // Join new room
            socket.join(`area_${areaId}`);
            
            // Store FULL player data
            gameState.players.set(playerId, {
                id: playerId,
                socketId: socket.id,
                roomId: areaId,
                username: playerData.username,
                position_x: playerData.position_x ?? 600,
                position_y: playerData.position_y ?? 400,
                direction: playerData.direction ?? 'front',
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

            // Update peak players
            if (gameState.players.size > gameState.stats.peakPlayers) {
                gameState.stats.peakPlayers = gameState.players.size;
            }

            // Send ALL current players to new player
            const roomPlayers = getRoomPlayers(areaId);
            console.log(`📤 [SYNC] Sending ${roomPlayers.length} players to ${playerData.username}`);
            socket.emit('playersUpdate', { players: roomPlayers });

            // Notify others about new player
            const fullPlayerData = getFullPlayerData(gameState.players.get(playerId));
            console.log('📢 [BROADCAST] Broadcasting new player to room');
            socket.to(`area_${areaId}`).emit('playerJoined', fullPlayerData);
            
            console.log(`✅ [SUCCESS] ${playerData.username} joined successfully`);

        } catch (error) {
            console.error('❌ [ERROR] Join error:', error);
        }
    });

    // 🏃 Player State Update
    socket.on('playerState', (data) => {
        try {
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
        } catch (error) {
            console.error('❌ [ERROR] State update error:', error);
        }
    });

    // 👗 Player Appearance Change
    socket.on('playerAppearanceChange', (data) => {
        try {
            const { playerId } = data;
            const player = gameState.players.get(playerId);
            
            if (player) {
                console.log('👗 [APPEARANCE] Update for:', player.username);
                
                player.skin_code = data.skin_code ?? player.skin_code;
                player.equipped_hair = data.equipped_hair !== undefined ? data.equipped_hair : player.equipped_hair;
                player.equipped_top = data.equipped_top !== undefined ? data.equipped_top : player.equipped_top;
                player.equipped_pants = data.equipped_pants !== undefined ? data.equipped_pants : player.equipped_pants;
                player.equipped_hat = data.equipped_hat !== undefined ? data.equipped_hat : player.equipped_hat;
                player.equipped_halo = data.equipped_halo !== undefined ? data.equipped_halo : player.equipped_halo;
                player.equipped_necklace = data.equipped_necklace !== undefined ? data.equipped_necklace : player.equipped_necklace;
                player.equipped_accessories = data.equipped_accessories || player.equipped_accessories;
                player.equipped_shoes = data.equipped_shoes !== undefined ? data.equipped_shoes : player.equipped_shoes;
                player.equipped_gloves = data.equipped_gloves !== undefined ? data.equipped_gloves : player.equipped_gloves;
                
                const fullPlayerData = getFullPlayerData(player);
                io.to(`area_${player.roomId}`).emit('playerAppearanceUpdate', fullPlayerData);
                
                console.log('✅ [APPEARANCE] Broadcasted to room');
            }
        } catch (error) {
            console.error('❌ [ERROR] Appearance update error:', error);
        }
    });

    // 💬 Chat Bubble
    socket.on('bubbleMessage', (data) => {
        try {
            const { playerId, message, username, adminLevel } = data;
            const player = gameState.players.get(playerId);
            
            if (player) {
                player.bubbleMessage = message;
                player.bubbleTimestamp = Date.now();
                gameState.stats.totalMessages++;
                
                io.to(`area_${player.roomId}`).emit('bubbleMessage', {
                    playerId,
                    message,
                    username,
                    adminLevel: adminLevel || 'user',
                    timestamp: Date.now()
                });
                
                console.log(`💬 [CHAT] ${username}: ${message}`);
            }
        } catch (error) {
            console.error('❌ [ERROR] Bubble error:', error);
        }
    });

    // 💤 AFK Status
    socket.on('playerAfk', (data) => {
        try {
            const { playerId, isAfk } = data;
            const player = gameState.players.get(playerId);
            
            if (player) {
                player.isAfk = isAfk;
                io.to(`area_${player.roomId}`).emit('playerAfkUpdate', { playerId, isAfk });
                console.log(`💤 [AFK] ${player.username}: ${isAfk}`);
            }
        } catch (error) {
            console.error('❌ [ERROR] AFK error:', error);
        }
    });

    // 🤝 Trade Request
    socket.on('tradeRequest', (data) => {
        try {
            const { tradeId, initiatorId, receiverId } = data;
            const receiver = gameState.players.get(receiverId);
            
            if (receiver) {
                io.to(receiver.socketId).emit('tradeRequest', { tradeId, initiatorId, receiverId });
                console.log(`🤝 [TRADE] Request: ${initiatorId} -> ${receiverId}`);
            }
        } catch (error) {
            console.error('❌ [ERROR] Trade request error:', error);
        }
    });

    // 🔄 Trade Update
    socket.on('tradeUpdate', (data) => {
        try {
            const { tradeId, status } = data;
            io.emit('tradeUpdate', { tradeId, status });
            console.log(`🔄 [TRADE] ${tradeId}: ${status}`);
        } catch (error) {
            console.error('❌ [ERROR] Trade update error:', error);
        }
    });

    // 🚪 Disconnect
    socket.on('disconnect', () => {
        console.log('❌ [DISCONNECT] Player disconnected:', socket.id);
        
        for (const [playerId, player] of gameState.players.entries()) {
            if (player.socketId === socket.id) {
                const roomId = player.roomId;
                gameState.players.delete(playerId);
                
                io.to(`area_${roomId}`).emit('playerLeft', { playerId });
                console.log(`👋 [REMOVE] ${player.username} removed (${gameState.players.size} remaining)`);
                break;
            }
        }
    });
});

// 🧹 Cleanup Inactive Players
setInterval(() => {
    const now = Date.now();
    const timeout = 5 * 60 * 1000;
    
    let cleaned = 0;
    for (const [playerId, player] of gameState.players.entries()) {
        if (now - player.lastUpdate > timeout) {
            const roomId = player.roomId;
            gameState.players.delete(playerId);
            io.to(`area_${roomId}`).emit('playerLeft', { playerId });
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 [CLEANUP] Removed ${cleaned} inactive players (${gameState.players.size} remaining)`);
    }
}, 30000);

// 📊 Stats Logger
setInterval(() => {
    console.log('═══════════════════════════════════════');
    console.log(`📊 [STATS] Active Players: ${gameState.players.size}`);
    console.log(`⏱️ [STATS] Uptime: ${Math.floor((Date.now() - gameState.startTime) / 1000 / 60)} minutes`);
    console.log(`📈 [STATS] Peak: ${gameState.stats.peakPlayers} | Messages: ${gameState.stats.totalMessages}`);
    console.log('═══════════════════════════════════════');
}, 5 * 60 * 1000);

// 🚀 Start Server
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════');
    console.log('🎮 TOUCH WORLD MULTIPLAYER SERVER v2.6');
    console.log('═══════════════════════════════════════');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🏥 Health: http://localhost:${PORT}/health`);
    console.log(`📊 Stats: http://localhost:${PORT}/stats`);
    console.log(`🌐 WebSocket: ws://localhost:${PORT}`);
    console.log('═══════════════════════════════════════');
});

export default httpServer;
