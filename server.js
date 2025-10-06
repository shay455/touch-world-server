import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

// ═══════════════════════════════════════════════════════════
// 🎮 TOUCH WORLD MULTIPLAYER SERVER v2.1
// Real-time game synchronization with Socket.IO
// ═══════════════════════════════════════════════════════════

const PORT = process.env.PORT || 10000;

// 🚀 Express Setup
const app = express();
const httpServer = createServer(app);

// 🔓 CORS - כל הדומיינים המותרים
const allowedOrigins = [
    // Development
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    
    // Base44
    'https://preview--copy-565f73e8.base44.app',
    'https://base44.app',
    
    // Touch World Domain
    'https://touch-world.io',
    'https://www.touch-world.io',
    'http://touch-world.io',
    'http://www.touch-world.io',
    
    // Regex Patterns
    /\.base44\.app$/,
    /\.touch-world\.io$/,
    /\.onrender\.com$/
];

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
            console.log('✅ Request with no origin allowed');
            return callback(null, true);
        }
        
        const isAllowed = allowedOrigins.some(allowed => {
            if (typeof allowed === 'string') {
                return allowed === origin;
            } else if (allowed instanceof RegExp) {
                return allowed.test(origin);
            }
            return false;
        });
        
        if (isAllowed) {
            console.log('✅ CORS allowed:', origin);
            callback(null, true);
        } else {
            console.warn('⚠️ CORS blocked:', origin);
            callback(null, false); // Changed to false instead of error
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// 🎮 Socket.IO Setup
const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            
            const isAllowed = allowedOrigins.some(allowed => {
                if (typeof allowed === 'string') {
                    return allowed === origin;
                } else if (allowed instanceof RegExp) {
                    return allowed.test(origin);
                }
                return false;
            });
            
            callback(null, isAllowed);
        },
        credentials: true,
        methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e8,
    connectTimeout: 45000,
    upgradeTimeout: 30000
});

// 📊 Game State (In-Memory Storage)
const gameState = {
    players: new Map(),
    rooms: new Map(),
    trades: new Map(),
    startTime: Date.now(),
    stats: {
        totalConnections: 0,
        totalMessages: 0,
        peakPlayers: 0
    }
};

// 🔧 Helper Functions
function getRoomPlayers(roomId) {
    const players = Array.from(gameState.players.values())
        .filter(p => p.roomId === roomId && !p.is_invisible);
    
    return players.map(p => ({
        id: p.id,
        username: p.username,
        position_x: p.position_x || 600,
        position_y: p.position_y || 400,
        direction: p.direction || 'front',
        skin_code: p.skin_code || 'blue',
        equipped_hair: p.equipped_hair,
        equipped_top: p.equipped_top,
        equipped_pants: p.equipped_pants,
        equipped_hat: p.equipped_hat,
        equipped_halo: p.equipped_halo,
        equipped_necklace: p.equipped_necklace,
        equipped_accessories: p.equipped_accessories || [],
        equipped_shoes: p.equipped_shoes,
        equipped_gloves: p.equipped_gloves,
        admin_level: p.admin_level || 'user',
        is_moving: p.is_moving || false,
        animation_frame: p.animation_frame || 'idle',
        velocity_x: p.velocity_x || 0,
        velocity_y: p.velocity_y || 0
    }));
}

function broadcastToRoom(roomId, event, data) {
    io.to(`area_${roomId}`).emit(event, data);
}

function updateRoomsList() {
    const rooms = new Map();
    for (const player of gameState.players.values()) {
        if (player.roomId) {
            if (!rooms.has(player.roomId)) {
                rooms.set(player.roomId, 0);
            }
            rooms.set(player.roomId, rooms.get(player.roomId) + 1);
        }
    }
    gameState.rooms = rooms;
}

function cleanupInactivePlayers() {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes
    
    let cleaned = 0;
    for (const [playerId, player] of gameState.players.entries()) {
        if (now - player.lastUpdate > timeout) {
            gameState.players.delete(playerId);
            cleaned++;
            console.log(`🧹 Removed inactive player: ${player.username}`);
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Cleaned ${cleaned} inactive players`);
        updateRoomsList();
    }
}

// 🔌 Socket.IO Connection Handler
io.on('connection', (socket) => {
    console.log('✅ Player connected:', socket.id);
    gameState.stats.totalConnections++;

    // 👋 Join Room
    socket.on('join', (data) => {
        try {
            const { playerId, areaId, playerData } = data;
            
            if (!playerId || !areaId || !playerData) {
                console.error('❌ Invalid join data:', data);
                socket.emit('error', { message: 'Invalid join data' });
                return;
            }

            console.log(`👤 Player joining: ${playerData.username} → ${areaId}`);

            // Leave previous room if exists
            const currentPlayer = gameState.players.get(playerId);
            if (currentPlayer?.roomId) {
                socket.leave(`area_${currentPlayer.roomId}`);
                socket.to(`area_${currentPlayer.roomId}`).emit('playerLeft', { playerId });
                console.log(`🚪 ${playerData.username} left area: ${currentPlayer.roomId}`);
            }

            // Join new room
            socket.join(`area_${areaId}`);
            console.log(`🚪 ${playerData.username} joined area: ${areaId}`);
            
            // Store/Update player state
            gameState.players.set(playerId, {
                ...playerData,
                socketId: socket.id,
                roomId: areaId,
                lastUpdate: Date.now(),
                isAfk: false,
                position_x: playerData.position_x || 600,
                position_y: playerData.position_y || 400,
                direction: playerData.direction || 'front',
                is_moving: false,
                animation_frame: 'idle'
            });

            // Update peak players stat
            if (gameState.players.size > gameState.stats.peakPlayers) {
                gameState.stats.peakPlayers = gameState.players.size;
            }

            // Send current room players to new player
            const roomPlayers = getRoomPlayers(areaId);
            socket.emit('playersUpdate', { players: roomPlayers });

            // Notify others about new player
            socket.to(`area_${areaId}`).emit('playerJoined', {
                id: playerData.id,
                username: playerData.username,
                position_x: playerData.position_x || 600,
                position_y: playerData.position_y || 400,
                direction: playerData.direction || 'front',
                skin_code: playerData.skin_code || 'blue',
                equipped_hair: playerData.equipped_hair,
                equipped_top: playerData.equipped_top,
                equipped_pants: playerData.equipped_pants,
                equipped_hat: playerData.equipped_hat,
                equipped_halo: playerData.equipped_halo,
                equipped_necklace: playerData.equipped_necklace,
                equipped_accessories: playerData.equipped_accessories || [],
                equipped_shoes: playerData.equipped_shoes,
                equipped_gloves: playerData.equipped_gloves,
                admin_level: playerData.admin_level || 'user'
            });

            updateRoomsList();
            console.log(`✅ ${playerData.username} joined successfully (${roomPlayers.length} players in room)`);
        } catch (error) {
            console.error('❌ Join error:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    // 🏃 Player State Update (Movement)
    socket.on('playerState', (data) => {
        try {
            const player = gameState.players.get(data.id);
            if (player) {
                // Update player state
                Object.assign(player, {
                    position_x: data.position_x,
                    position_y: data.position_y,
                    direction: data.direction,
                    is_moving: data.is_moving,
                    animation_frame: data.animation_frame,
                    velocity_x: data.velocity_x || 0,
                    velocity_y: data.velocity_y || 0,
                    lastUpdate: Date.now()
                });

                // Broadcast to room
                socket.to(`area_${player.roomId}`).emit('playerStateUpdate', {
                    id: data.id,
                    position_x: data.position_x,
                    position_y: data.position_y,
                    direction: data.direction,
                    is_moving: data.is_moving,
                    animation_frame: data.animation_frame,
                    velocity_x: data.velocity_x || 0,
                    velocity_y: data.velocity_y || 0
                });
            }
        } catch (error) {
            console.error('❌ State update error:', error);
        }
    });

    // 💬 Chat Bubble
    socket.on('bubbleMessage', (data) => {
        try {
            const { playerId, message, username, adminLevel } = data;
            const player = gameState.players.get(playerId);
            
            if (player && message) {
                console.log(`💬 ${username}: ${message}`);
                gameState.stats.totalMessages++;

                broadcastToRoom(player.roomId, 'bubbleMessage', {
                    playerId,
                    message,
                    username,
                    adminLevel: adminLevel || 'user',
                    timestamp: Date.now()
                });

                player.lastUpdate = Date.now();
            }
        } catch (error) {
            console.error('❌ Bubble message error:', error);
        }
    });

    // 👗 Appearance Change
    socket.on('playerAppearanceChange', (data) => {
        try {
            const { playerId } = data;
            const player = gameState.players.get(playerId);
            
            if (player) {
                // Update player appearance
                Object.assign(player, {
                    skin_code: data.skin_code || player.skin_code,
                    equipped_hair: data.equipped_hair !== undefined ? data.equipped_hair : player.equipped_hair,
                    equipped_top: data.equipped_top !== undefined ? data.equipped_top : player.equipped_top,
                    equipped_pants: data.equipped_pants !== undefined ? data.equipped_pants : player.equipped_pants,
                    equipped_hat: data.equipped_hat !== undefined ? data.equipped_hat : player.equipped_hat,
                    equipped_halo: data.equipped_halo !== undefined ? data.equipped_halo : player.equipped_halo,
                    equipped_necklace: data.equipped_necklace !== undefined ? data.equipped_necklace : player.equipped_necklace,
                    equipped_accessories: data.equipped_accessories || player.equipped_accessories,
                    equipped_shoes: data.equipped_shoes !== undefined ? data.equipped_shoes : player.equipped_shoes,
                    equipped_gloves: data.equipped_gloves !== undefined ? data.equipped_gloves : player.equipped_gloves,
                    lastUpdate: Date.now()
                });

                console.log(`👗 ${player.username} changed appearance`);

                // Broadcast to room
                socket.to(`area_${player.roomId}`).emit('playerAppearanceUpdate', {
                    id: playerId,
                    username: player.username,
                    skin_code: player.skin_code,
                    equipped_hair: player.equipped_hair,
                    equipped_top: player.equipped_top,
                    equipped_pants: player.equipped_pants,
                    equipped_hat: player.equipped_hat,
                    equipped_halo: player.equipped_halo,
                    equipped_necklace: player.equipped_necklace,
                    equipped_accessories: player.equipped_accessories,
                    equipped_shoes: player.equipped_shoes,
                    equipped_gloves: player.equipped_gloves
                });
            }
        } catch (error) {
            console.error('❌ Appearance change error:', error);
        }
    });

    // 💤 AFK Status
    socket.on('playerAfk', (data) => {
        try {
            const { playerId, isAfk } = data;
            const player = gameState.players.get(playerId);
            
            if (player) {
                player.isAfk = isAfk;
                player.lastUpdate = Date.now();
                
                broadcastToRoom(player.roomId, 'playerAfkUpdate', { 
                    playerId, 
                    isAfk 
                });

                console.log(`💤 ${player.username} is ${isAfk ? 'AFK' : 'back'}`);
            }
        } catch (error) {
            console.error('❌ AFK update error:', error);
        }
    });

    // 🤝 Trade Request
    socket.on('tradeRequest', (data) => {
        try {
            const { tradeId, initiatorId, receiverId } = data;
            const receiver = gameState.players.get(receiverId);
            
            if (receiver && receiver.socketId) {
                io.to(receiver.socketId).emit('tradeRequest', { 
                    tradeId, 
                    initiatorId, 
                    receiverId 
                });
                console.log(`🤝 Trade request: ${initiatorId} → ${receiverId}`);
            }
        } catch (error) {
            console.error('❌ Trade request error:', error);
        }
    });

    // 🔄 Trade Update
    socket.on('tradeUpdate', (data) => {
        try {
            const { tradeId, status } = data;
            
            // Broadcast to all connected clients
            io.emit('tradeUpdate', { tradeId, status });
            
            console.log(`🔄 Trade ${tradeId} updated: ${status}`);
        } catch (error) {
            console.error('❌ Trade update error:', error);
        }
    });

    // 🚪 Disconnect
    socket.on('disconnect', (reason) => {
        console.log('❌ Player disconnected:', socket.id, 'Reason:', reason);
        
        // Find and remove player
        for (const [playerId, player] of gameState.players.entries()) {
            if (player.socketId === socket.id) {
                const roomId = player.roomId;
                const username = player.username;
                
                gameState.players.delete(playerId);
                updateRoomsList();
                
                // Notify room
                broadcastToRoom(roomId, 'playerLeft', { playerId });
                
                console.log(`👋 ${username} left the game`);
                break;
            }
        }
    });

    // ❌ Error Handler
    socket.on('error', (error) => {
        console.error('❌ Socket error:', error);
    });
});

// 🔄 Periodic Room Updates (every 5 seconds)
setInterval(() => {
    for (const [roomId] of gameState.rooms) {
        const players = getRoomPlayers(roomId);
        if (players.length > 0) {
            broadcastToRoom(roomId, 'playersUpdate', { players });
        }
    }
}, 5000);

// 🧹 Cleanup Inactive Players (every 30 seconds)
setInterval(cleanupInactivePlayers, 30000);

// 🏥 Health Check Endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        players: gameState.players.size,
        rooms: gameState.rooms.size,
        uptime: Math.floor((Date.now() - gameState.startTime) / 1000),
        port: PORT,
        stats: {
            totalConnections: gameState.stats.totalConnections,
            totalMessages: gameState.stats.totalMessages,
            peakPlayers: gameState.stats.peakPlayers
        }
    });
});

// 🏠 Root Endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'Touch World Multiplayer Server',
        version: '2.1.0',
        status: 'running',
        players: gameState.players.size,
        rooms: Array.from(gameState.rooms.entries()).map(([id, count]) => ({
            id,
            players: count
        }))
    });
});

// 📊 Stats Endpoint
app.get('/stats', (req, res) => {
    const playersList = Array.from(gameState.players.values()).map(p => ({
        username: p.username,
        room: p.roomId,
        isAfk: p.isAfk
    }));

    res.json({
        currentPlayers: gameState.players.size,
        rooms: Array.from(gameState.rooms.entries()).map(([id, count]) => ({
            id,
            players: count
        })),
        players: playersList,
        stats: gameState.stats,
        uptime: Math.floor((Date.now() - gameState.startTime) / 1000)
    });
});

// 🚀 Start Server
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════');
    console.log('🎮 TOUCH WORLD MULTIPLAYER SERVER');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔌 WebSocket ready for connections`);
    console.log(`🏥 Health: http://localhost:${PORT}/health`);
    console.log(`📊 Stats: http://localhost:${PORT}/stats`);
    console.log('═══════════════════════════════════════');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    httpServer.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    httpServer.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

export default httpServer;
