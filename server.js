import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

// ═══════════════════════════════════════════════════════════
// 🎮 TOUCH WORLD MULTIPLAYER SERVER v2.2
// Full Player Synchronization
// ═══════════════════════════════════════════════════════════

const PORT = process.env.PORT || 10000;

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
    startTime: Date.now()
};

// 🔧 Helper: Get All Player Data
function getFullPlayerData(player) {
    return {
        id: player.id,
        username: player.username,
        position_x: player.position_x || 600,
        position_y: player.position_y || 400,
        direction: player.direction || 'front',
        is_moving: player.is_moving || false,
        animation_frame: player.animation_frame || 'idle',
        velocity_x: player.velocity_x || 0,
        velocity_y: player.velocity_y || 0,
        
        // 👗 Appearance Data
        skin_code: player.skin_code || 'blue',
        equipped_hair: player.equipped_hair || null,
        equipped_top: player.equipped_top || null,
        equipped_pants: player.equipped_pants || null,
        equipped_hat: player.equipped_hat || null,
        equipped_halo: player.equipped_halo || null,
        equipped_necklace: player.equipped_necklace || null,
        equipped_accessories: player.equipped_accessories || [],
        equipped_shoes: player.equipped_shoes || null,
        equipped_gloves: player.equipped_gloves || null,
        
        // 🎭 Status
        admin_level: player.admin_level || 'user',
        is_invisible: player.is_invisible || false,
        isAfk: player.isAfk || false,
        
        // 💬 Bubble
        bubbleMessage: player.bubbleMessage || null,
        bubbleTimestamp: player.bubbleTimestamp || null
    };
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

// 🔌 Socket.IO Events
io.on('connection', (socket) => {
    console.log('✅ Player connected:', socket.id);

    // 👋 Join Room
    socket.on('join', (data) => {
        try {
            const { playerId, areaId, playerData } = data;
            
            console.log(`👤 ${playerData.username} joining ${areaId}`);
            console.log('📦 Player data:', {
                skin: playerData.skin_code,
                hair: playerData.equipped_hair,
                top: playerData.equipped_top,
                pants: playerData.equipped_pants
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
            
            // Store FULL player data
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
                
                // 👗 Store ALL appearance data
                skin_code: playerData.skin_code || 'blue',
                equipped_hair: playerData.equipped_hair || null,
                equipped_top: playerData.equipped_top || null,
                equipped_pants: playerData.equipped_pants || null,
                equipped_hat: playerData.equipped_hat || null,
                equipped_halo: playerData.equipped_halo || null,
                equipped_necklace: playerData.equipped_necklace || null,
                equipped_accessories: playerData.equipped_accessories || [],
                equipped_shoes: playerData.equipped_shoes || null,
                equipped_gloves: playerData.equipped_gloves || null,
                
                admin_level: playerData.admin_level || 'user',
                is_invisible: playerData.is_invisible || false,
                isAfk: false,
                lastUpdate: Date.now()
            });

            // Send ALL current players to new player
            const roomPlayers = getRoomPlayers(areaId);
            console.log(`📤 Sending ${roomPlayers.length} players to ${playerData.username}`);
            socket.emit('playersUpdate', { players: roomPlayers });

            // Notify others about new player (with FULL data)
            const fullPlayerData = getFullPlayerData(gameState.players.get(playerId));
            socket.to(`area_${areaId}`).emit('playerJoined', fullPlayerData);
            
            console.log(`✅ ${playerData.username} joined successfully`);
            console.log(`👥 Room now has ${roomPlayers.length} players`);

        } catch (error) {
            console.error('❌ Join error:', error);
        }
    });

    // 🏃 Player State Update (Movement)
    socket.on('playerState', (data) => {
        try {
            const player = gameState.players.get(data.id);
            if (player) {
                // Update movement data
                player.position_x = data.position_x;
                player.position_y = data.position_y;
                player.direction = data.direction;
                player.is_moving = data.is_moving;
                player.animation_frame = data.animation_frame;
                player.velocity_x = data.velocity_x || 0;
                player.velocity_y = data.velocity_y || 0;
                player.lastUpdate = Date.now();
                
                // Broadcast to others in room
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
                console.log(`👗 Appearance change for ${player.username}`);
                
                // Update ALL appearance fields
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
                
                // Broadcast FULL appearance to everyone in room
                const fullPlayerData = getFullPlayerData(player);
                io.to(`area_${player.roomId}`).emit('playerAppearanceUpdate', fullPlayerData);
                
                console.log(`✅ Appearance updated and broadcast`);
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
                
                io.to(`area_${player.roomId}`).emit('bubbleMessage', {
                    playerId,
                    message,
                    username,
                    adminLevel: adminLevel || 'user',
                    timestamp: Date.now()
                });
                
                console.log(`💬 ${username}: ${message}`);
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
                console.log(`💤 ${player.username} AFK: ${isAfk}`);
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
                console.log(`🤝 Trade request: ${initiatorId} -> ${receiverId}`);
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
            console.log(`🔄 Trade ${tradeId}: ${status}`);
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

// 🏥 Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.floor((Date.now() - gameState.startTime) / 1000),
        players: gameState.players.size,
        port: PORT,
        version: '2.2'
    });
});

// 📊 Stats Endpoint
app.get('/stats', (req, res) => {
    const rooms = new Map();
    for (const player of gameState.players.values()) {
        const count = rooms.get(player.roomId) || 0;
        rooms.set(player.roomId, count + 1);
    }
    
    res.json({
        totalPlayers: gameState.players.size,
        rooms: Object.fromEntries(rooms),
        uptime: Math.floor((Date.now() - gameState.startTime) / 1000)
    });
});

// 🧹 Cleanup Inactive Players (every 30 seconds)
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

// 📊 Stats Logger (every 5 minutes)
setInterval(() => {
    console.log('═══════════════════════════════════════');
    console.log(`👥 Active Players: ${gameState.players.size}`);
    console.log(`⏱️ Uptime: ${Math.floor((Date.now() - gameState.startTime) / 1000 / 60)} minutes`);
    console.log('═══════════════════════════════════════');
}, 5 * 60 * 1000);

// 🚀 Start Server
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════');
    console.log('🎮 TOUCH WORLD MULTIPLAYER SERVER v2.2');
    console.log('═══════════════════════════════════════');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🏥 Health: http://localhost:${PORT}/health`);
    console.log(`📊 Stats: http://localhost:${PORT}/stats`);
    console.log('═══════════════════════════════════════');
});

export default httpServer;
