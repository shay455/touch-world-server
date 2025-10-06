import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

// ═══════════════════════════════════════════════════════════
// 🎮 TOUCH WORLD MULTIPLAYER SERVER v2.5
// Full Appearance Synchronization (NO DEFAULT BLUE!)
// ═══════════════════════════════════════════════════════════

const PORT = process.env.PORT || 10000;
const DEBUG = true;

const app = express();
const httpServer = createServer(app);

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
    connectTimeout: 45000
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

// 🔧 Helper: Get Full Player Data (NO DEFAULTS!)
function getFullPlayerData(player) {
    const data = {
        id: player.id,
        username: player.username,
        
        // Position & Movement
        position_x: player.position_x ?? 600,
        position_y: player.position_y ?? 400,
        direction: player.direction ?? 'front',
        is_moving: player.is_moving ?? false,
        animation_frame: player.animation_frame ?? 'idle',
        velocity_x: player.velocity_x ?? 0,
        velocity_y: player.velocity_y ?? 0,
        
        // 👗 CRITICAL: Full Appearance (NO DEFAULTS - use what client sends!)
        skin_code: player.skin_code,  // ✅ NO DEFAULT!
        equipped_hair: player.equipped_hair,
        equipped_top: player.equipped_top,
        equipped_pants: player.equipped_pants,
        equipped_hat: player.equipped_hat,
        equipped_halo: player.equipped_halo,
        equipped_necklace: player.equipped_necklace,
        equipped_accessories: player.equipped_accessories || [],
        equipped_shoes: player.equipped_shoes,
        equipped_gloves: player.equipped_gloves,
        
        // Status
        admin_level: player.admin_level || 'user',
        is_invisible: player.is_invisible || false,
        isAfk: player.isAfk || false,
        
        // Chat bubble
        bubbleMessage: player.bubbleMessage || null,
        bubbleTimestamp: player.bubbleTimestamp || null
    };
    
    if (DEBUG) {
        console.log('📤 Sending player data:', {
            id: data.id,
            username: data.username,
            skin: data.skin_code,
            hair: data.equipped_hair,
            top: data.equipped_top,
            pants: data.equipped_pants
        });
    }
    
    return data;
}

// 🔧 Helper: Get Room Players
function getRoomPlayers(roomId) {
    const players = [];
    for (const [id, player] of gameState.players.entries()) {
        if (player.roomId === roomId && !player.is_invisible) {
            players.push(getFullPlayerData(player));
        }
    }
    return players;
}

// 🏠 Beautiful Home Page
app.get('/', (req, res) => {
    const uptime = Math.floor((Date.now() - gameState.startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    // Get players by area
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
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            color: white;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header {
            text-align: center;
            margin-bottom: 40px;
            animation: fadeInDown 0.8s;
        }
        .header h1 {
            font-size: 3em;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .status {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin: 20px 0;
            font-size: 1.3em;
        }
        .status-dot {
            width: 12px;
            height: 12px;
            background: #00ff00;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: rgba(255, 255, 255, 0.15);
            backdrop-filter: blur(10px);
            padding: 25px;
            border-radius: 15px;
            text-align: center;
            border: 1px solid rgba(255, 255, 255, 0.2);
            transition: transform 0.3s, box-shadow 0.3s;
        }
        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        .stat-value {
            font-size: 2.5em;
            font-weight: bold;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .stat-label {
            opacity: 0.9;
            font-size: 1.1em;
        }
        .areas-section {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 30px;
            border-radius: 20px;
            margin-bottom: 30px;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .area-item {
            background: rgba(255, 255, 255, 0.1);
            padding: 15px 20px;
            border-radius: 10px;
            margin: 10px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .players-section {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 30px;
            border-radius: 20px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            max-height: 400px;
            overflow-y: auto;
        }
        .player-item {
            background: rgba(255, 255, 255, 0.1);
            padding: 15px;
            border-radius: 10px;
            margin: 10px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .skin-badge {
            display: inline-block;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.9em;
            font-weight: bold;
            background: rgba(255, 255, 255, 0.2);
        }
        h2 {
            font-size: 1.8em;
            margin-bottom: 20px;
            text-shadow: 1px 1px 3px rgba(0,0,0,0.3);
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            opacity: 0.8;
            font-size: 0.9em;
        }
        @keyframes fadeInDown {
            from { opacity: 0; transform: translateY(-30px); }
            to { opacity: 1; transform: translateY(0); }
        }
    </style>
    <script>
        // Auto refresh every 10 seconds
        setTimeout(() => window.location.reload(), 10000);
    </script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎮 Touch World Server</h1>
            <p class="version">v2.5 - Full Synchronization</p>
            <div class="status">
                <div class="status-dot"></div>
                <span>Server Online</span>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${gameState.players.size}</div>
                <div class="stat-label">👥 שחקנים מחוברים</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}</div>
                <div class="stat-label">⏱️ זמן פעילות</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${gameState.stats.peakPlayers}</div>
                <div class="stat-label">📈 שיא שחקנים</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${gameState.stats.totalConnections}</div>
                <div class="stat-label">🔌 סה"כ חיבורים</div>
            </div>
        </div>

        <div class="areas-section">
            <h2>🗺️ שחקנים לפי אזורים</h2>
            ${Object.entries(areaStats).length > 0 ? 
                Object.entries(areaStats).map(([area, count]) => `
                    <div class="area-item">
                        <span>${areaNames[area] || area}</span>
                        <span style="font-size: 1.2em; font-weight: bold;">${count} 👥</span>
                    </div>
                `).join('') : 
                '<p style="text-align: center; opacity: 0.7;">אין שחקנים מחוברים כרגע</p>'
            }
        </div>

        ${playersList.length > 0 ? `
        <div class="players-section">
            <h2>👥 שחקנים מחוברים</h2>
            ${playersList.map(p => `
                <div class="player-item">
                    <span style="font-weight: bold;">${p.username}</span>
                    <div>
                        <span class="skin-badge">${p.skin || 'unknown'}</span>
                        <span style="margin-right: 10px; opacity: 0.8;">${areaNames[p.area] || p.area}</span>
                    </div>
                </div>
            `).join('')}
        </div>
        ` : ''}

        <div class="footer">
            <p>© 2025 Touch World - Multiplayer Server</p>
            <p style="margin-top: 10px; opacity: 0.6;">הדף מתרענן אוטומטית כל 10 שניות</p>
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
        port: PORT,
        version: '2.5'
    });
});

// 📊 Stats API
app.get('/stats', (req, res) => {
    const areaStats = {};
    for (const player of gameState.players.values()) {
        if (!player.is_invisible) {
            areaStats[player.roomId] = (areaStats[player.roomId] || 0) + 1;
        }
    }
    
    res.json({
        totalPlayers: gameState.players.size,
        areaStats,
        stats: gameState.stats,
        uptime: Math.floor((Date.now() - gameState.startTime) / 1000),
        version: '2.5'
    });
});

// 🔌 Socket.IO Events
io.on('connection', (socket) => {
    console.log('✅ Player connected:', socket.id);
    gameState.stats.totalConnections++;

    // 👋 Join Room
    socket.on('join', (data) => {
        try {
            const { playerId, areaId, playerData } = data;
            
            if (!playerId || !areaId || !playerData) {
                console.error('❌ Invalid join data:', { playerId, areaId, hasPlayerData: !!playerData });
                return;
            }

            console.log('═══════════════════════════════════════');
            console.log(`👤 ${playerData.username} joining ${areaId}`);
            console.log('📦 Received appearance data:', {
                skin: playerData.skin_code,
                hair: playerData.equipped_hair,
                top: playerData.equipped_top,
                pants: playerData.equipped_pants,
                hat: playerData.equipped_hat,
                accessories: playerData.equipped_accessories
            });

            // Leave previous room
            const currentPlayer = gameState.players.get(playerId);
            if (currentPlayer?.roomId) {
                const oldRoom = currentPlayer.roomId;
                socket.leave(`area_${oldRoom}`);
                socket.to(`area_${oldRoom}`).emit('playerLeft', { playerId });
                console.log(`🚪 Left area: ${oldRoom}`);
            }

            // Join new room
            socket.join(`area_${areaId}`);
            
            // ✅ Store EXACT player data (NO DEFAULTS!)
            const fullPlayerData = {
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
                
                // ✅ CRITICAL: Store EXACT appearance (what client sent)
                skin_code: playerData.skin_code,  // NO DEFAULT!
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
            };

            gameState.players.set(playerId, fullPlayerData);
            
            // Update peak players
            if (gameState.players.size > gameState.stats.peakPlayers) {
                gameState.stats.peakPlayers = gameState.players.size;
            }

            console.log('💾 Stored player data:', {
                skin: fullPlayerData.skin_code,
                hair: fullPlayerData.equipped_hair,
                top: fullPlayerData.equipped_top
            });

            // Send current players to new player
            const roomPlayers = getRoomPlayers(areaId);
            console.log(`📤 Sending ${roomPlayers.length} players to ${playerData.username}`);
            socket.emit('playersUpdate', { players: roomPlayers });

            // Notify others about new player
            const newPlayerData = getFullPlayerData(fullPlayerData);
            socket.to(`area_${areaId}`).emit('playerJoined', newPlayerData);
            
            console.log(`✅ ${playerData.username} joined successfully`);
            console.log('═══════════════════════════════════════');

        } catch (error) {
            console.error('❌ Join error:', error);
        }
    });

    // 🏃 Player State Update
    socket.on('playerState', (data) => {
        try {
            const player = gameState.players.get(data.id);
            if (player) {
                // Update movement ONLY (don't touch appearance!)
                player.position_x = data.position_x;
                player.position_y = data.position_y;
                player.direction = data.direction;
                player.is_moving = data.is_moving;
                player.animation_frame = data.animation_frame;
                player.velocity_x = data.velocity_x ?? 0;
                player.velocity_y = data.velocity_y ?? 0;
                player.lastUpdate = Date.now();
                
                // Broadcast to others
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
            console.error('❌ State update error:', error);
        }
    });

    // 👗 Player Appearance Change
    socket.on('playerAppearanceChange', (data) => {
        try {
            const { playerId } = data;
            const player = gameState.players.get(playerId);
            
            if (player) {
                console.log('═══════════════════════════════════════');
                console.log(`👗 Appearance change for ${player.username}`);
                console.log('📦 New appearance:', {
                    skin: data.skin_code,
                    hair: data.equipped_hair,
                    top: data.equipped_top,
                    pants: data.equipped_pants
                });
                
                // Update EXACT appearance data
                if (data.skin_code !== undefined) player.skin_code = data.skin_code;
                if (data.equipped_hair !== undefined) player.equipped_hair = data.equipped_hair;
                if (data.equipped_top !== undefined) player.equipped_top = data.equipped_top;
                if (data.equipped_pants !== undefined) player.equipped_pants = data.equipped_pants;
                if (data.equipped_hat !== undefined) player.equipped_hat = data.equipped_hat;
                if (data.equipped_halo !== undefined) player.equipped_halo = data.equipped_halo;
                if (data.equipped_necklace !== undefined) player.equipped_necklace = data.equipped_necklace;
                if (data.equipped_accessories !== undefined) player.equipped_accessories = data.equipped_accessories;
                if (data.equipped_shoes !== undefined) player.equipped_shoes = data.equipped_shoes;
                if (data.equipped_gloves !== undefined) player.equipped_gloves = data.equipped_gloves;
                
                // Broadcast FULL appearance to everyone
                const fullPlayerData = getFullPlayerData(player);
                io.to(`area_${player.roomId}`).emit('playerAppearanceUpdate', fullPlayerData);
                
                console.log('✅ Appearance updated and broadcast');
                console.log('═══════════════════════════════════════');
            }
        } catch (error) {
            console.error('❌ Appearance update error:', error);
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
                
                if (DEBUG) {
                    console.log(`💬 ${username}: ${message}`);
                }
            }
        } catch (error) {
            console.error('❌ Bubble error:', error);
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
                
                if (DEBUG) {
                    console.log(`💤 ${player.username} AFK: ${isAfk}`);
                }
            }
        } catch (error) {
            console.error('❌ AFK error:', error);
        }
    });

    // 🤝 Trade Request
    socket.on('tradeRequest', (data) => {
        try {
            const { tradeId, initiatorId, receiverId } = data;
            const receiver = gameState.players.get(receiverId);
            
            if (receiver) {
                io.to(receiver.socketId).emit('tradeRequest', { tradeId, initiatorId, receiverId });
                
                if (DEBUG) {
                    console.log(`🤝 Trade request: ${initiatorId} -> ${receiverId}`);
                }
            }
        } catch (error) {
            console.error('❌ Trade request error:', error);
        }
    });

    // 🔄 Trade Update
    socket.on('tradeUpdate', (data) => {
        try {
            const { tradeId, status } = data;
            io.emit('tradeUpdate', { tradeId, status });
            
            if (DEBUG) {
                console.log(`🔄 Trade ${tradeId}: ${status}`);
            }
        } catch (error) {
            console.error('❌ Trade update error:', error);
        }
    });

    // 🚪 Disconnect
    socket.on('disconnect', () => {
        console.log('❌ Player disconnected:', socket.id);
        
        for (const [playerId, player] of gameState.players.entries()) {
            if (player.socketId === socket.id) {
                const roomId = player.roomId;
                gameState.players.delete(playerId);
                
                io.to(`area_${roomId}`).emit('playerLeft', { playerId });
                console.log(`👋 ${player.username} left (${gameState.players.size} players remaining)`);
                break;
            }
        }
    });
});

// 🧹 Cleanup inactive players (every 30 seconds)
setInterval(() => {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes
    
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
        console.log(`🧹 Cleaned ${cleaned} inactive players (${gameState.players.size} remaining)`);
    }
}, 30000);

// 📊 Stats logger (every 5 minutes)
setInterval(() => {
    if (gameState.players.size > 0 || DEBUG) {
        console.log('═══════════════════════════════════════');
        console.log(`👥 Active Players: ${gameState.players.size}`);
        console.log(`📈 Peak Players: ${gameState.stats.peakPlayers}`);
        console.log(`🔌 Total Connections: ${gameState.stats.totalConnections}`);
        console.log(`⏱️ Uptime: ${Math.floor((Date.now() - gameState.startTime) / 1000 / 60)} minutes`);
        console.log('═══════════════════════════════════════');
    }
}, 5 * 60 * 1000);

// 🚀 Start Server
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════');
    console.log('🎮 TOUCH WORLD MULTIPLAYER SERVER v2.5');
    console.log('═══════════════════════════════════════');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🏥 Health: http://localhost:${PORT}/health`);
    console.log(`📊 Stats: http://localhost:${PORT}/stats`);
    console.log(`🌐 Home: http://localhost:${PORT}/`);
    console.log('═══════════════════════════════════════');
});

export default httpServer;
