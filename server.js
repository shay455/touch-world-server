import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

// ═══════════════════════════════════════════════════════════
// 🎮 TOUCH WORLD MULTIPLAYER SERVER
// Real-time game synchronization with Socket.IO
// ═══════════════════════════════════════════════════════════

const PORT = process.env.PORT || 10000;

// 🚀 Express App
const app = express();
const httpServer = createServer(app);

// 🔓 CORS Configuration
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://preview--copy-565f73e8.base44.app',
    'https://base44.app',
    /\.base44\.app$/,
    /\.onrender\.com$/
];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        
        const isAllowed = allowedOrigins.some(allowed => 
            typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
        );
        
        if (isAllowed) {
            callback(null, true);
        } else {
            console.warn('⚠️ Blocked by CORS:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST']
};

app.use(cors(corsOptions));
app.use(express.json());

// 🎮 Socket.IO Configuration
const io = new Server(httpServer, {
    cors: corsOptions,
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e8,
    connectTimeout: 45000
});

// 📊 Game State (In-Memory)
const gameState = {
    players: new Map(),
    rooms: new Map(),
    startTime: Date.now()
};

// 🔧 Helper Functions
function getRoomPlayers(roomId) {
    return Array.from(gameState.players.values())
        .filter(p => p.roomId === roomId && !p.is_invisible)
        .map(p => ({
            id: p.id,
            username: p.username,
            position_x: p.position_x,
            position_y: p.position_y,
            direction: p.direction,
            skin_code: p.skin_code,
            equipped_hair: p.equipped_hair,
            equipped_top: p.equipped_top,
            equipped_pants: p.equipped_pants,
            equipped_hat: p.equipped_hat,
            equipped_halo: p.equipped_halo,
            equipped_necklace: p.equipped_necklace,
            equipped_accessories: p.equipped_accessories,
            admin_level: p.admin_level,
            is_moving: p.is_moving,
            animation_frame: p.animation_frame
        }));
}

function broadcastToRoom(roomId, event, data) {
    io.to(`area_${roomId}`).emit(event, data);
}

function cleanupInactivePlayers() {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes
    
    let cleaned = 0;
    for (const [playerId, player] of gameState.players.entries()) {
        if (now - player.lastUpdate > timeout) {
            gameState.players.delete(playerId);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Cleaned ${cleaned} inactive players`);
    }
}

// 🔌 Socket.IO Connection Handler
io.on('connection', (socket) => {
    console.log('✅ Player connected:', socket.id);

    // 👋 Join Room
    socket.on('join', (data) => {
        try {
            const { playerId, areaId, playerData } = data;
            
            if (!playerId || !areaId || !playerData) {
                console.error('❌ Invalid join data');
                return;
            }

            console.log(`👤 ${playerData.username} joining ${areaId}`);

            // Leave previous room
            const currentPlayer = gameState.players.get(playerId);
            if (currentPlayer?.roomId) {
                socket.leave(`area_${currentPlayer.roomId}`);
                socket.to(`area_${currentPlayer.roomId}`).emit('playerLeft', { playerId });
            }

            // Join new room
            socket.join(`area_${areaId}`);
            
            // Store player state
            gameState.players.set(playerId, {
                ...playerData,
                socketId: socket.id,
                roomId: areaId,
                lastUpdate: Date.now(),
                isAfk: false
            });

            // Send current players to new player
            const roomPlayers = getRoomPlayers(areaId);
            socket.emit('playersUpdate', { players: roomPlayers });

            // Notify others (only if not invisible)
            if (!playerData.is_invisible) {
                socket.to(`area_${areaId}`).emit('playerJoined', playerData);
            }

            console.log(`✅ ${playerData.username} joined ${areaId} (${roomPlayers.length} players)`);
        } catch (error) {
            console.error('❌ Join error:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    // 🏃 Player State Update
    socket.on('playerState', (data) => {
        try {
            const player = gameState.players.get(data.id);
            if (player) {
                Object.assign(player, {
                    position_x: data.position_x,
                    position_y: data.position_y,
                    direction: data.direction,
                    is_moving: data.is_moving,
                    animation_frame: data.animation_frame,
                    velocity_x: data.velocity_x,
                    velocity_y: data.velocity_y,
                    lastUpdate: Date.now()
                });
                
                // Only broadcast if not invisible
                if (!player.is_invisible) {
                    socket.to(`area_${player.roomId}`).emit('playerStateUpdate', data);
                }
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
            
            if (player && message && message.trim()) {
                console.log(`💬 ${username}: ${message}`);
                
                broadcastToRoom(player.roomId, 'bubbleMessage', {
                    playerId,
                    message: message.trim(),
                    username,
                    adminLevel,
                    timestamp: Date.now()
                });
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
                Object.assign(player, {
                    skin_code: data.skin_code,
                    equipped_hair: data.equipped_hair,
                    equipped_top: data.equipped_top,
                    equipped_pants: data.equipped_pants,
                    equipped_hat: data.equipped_hat,
                    equipped_halo: data.equipped_halo,
                    equipped_necklace: data.equipped_necklace,
                    equipped_accessories: data.equipped_accessories,
                    equipped_shoes: data.equipped_shoes,
                    equipped_gloves: data.equipped_gloves
                });
                
                console.log(`👗 ${player.username} changed appearance`);
                
                socket.to(`area_${player.roomId}`).emit('playerAppearanceUpdate', {
                    ...data,
                    username: player.username
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
                console.log(`💤 ${player.username} is ${isAfk ? 'AFK' : 'back'}`);
                
                broadcastToRoom(player.roomId, 'playerAfkUpdate', {
                    playerId,
                    isAfk
                });
            }
        } catch (error) {
            console.error('❌ AFK update error:', error);
        }
    });

    // 🤝 Trade Requests
    socket.on('tradeRequest', (data) => {
        try {
            const { tradeId, initiatorId, receiverId } = data;
            console.log(`🤝 Trade request: ${initiatorId} → ${receiverId}`);
            
            const receiver = gameState.players.get(receiverId);
            if (receiver?.socketId) {
                io.to(receiver.socketId).emit('tradeRequest', { tradeId, initiatorId, receiverId });
            }
        } catch (error) {
            console.error('❌ Trade request error:', error);
        }
    });

    socket.on('tradeUpdate', (data) => {
        try {
            const { tradeId, status } = data;
            console.log(`🔄 Trade update: ${tradeId} → ${status}`);
            
            // Broadcast to all players in the trade
            io.emit('tradeUpdate', { tradeId, status });
        } catch (error) {
            console.error('❌ Trade update error:', error);
        }
    });

    // 🚪 Player Disconnect
    socket.on('disconnect', () => {
        try {
            let disconnectedPlayer = null;
            
            for (const [playerId, player] of gameState.players.entries()) {
                if (player.socketId === socket.id) {
                    disconnectedPlayer = player;
                    gameState.players.delete(playerId);
                    
                    socket.to(`area_${player.roomId}`).emit('playerLeft', { playerId });
                    console.log(`👋 ${player.username} disconnected`);
                    break;
                }
            }
        } catch (error) {
            console.error('❌ Disconnect error:', error);
        }
    });
});

// 🏥 Health Check Endpoint
app.get('/health', (req, res) => {
    const uptime = (Date.now() - gameState.startTime) / 1000;
    const playerCount = gameState.players.size;
    
    res.json({
        status: 'ok',
        players: playerCount,
        uptime: uptime,
        port: PORT,
        timestamp: new Date().toISOString()
    });
});

// 📊 Stats Endpoint
app.get('/stats', (req, res) => {
    const rooms = {};
    for (const [playerId, player] of gameState.players.entries()) {
        const roomId = player.roomId || 'unknown';
        rooms[roomId] = (rooms[roomId] || 0) + 1;
    }
    
    res.json({
        totalPlayers: gameState.players.size,
        rooms: rooms,
        uptime: (Date.now() - gameState.startTime) / 1000
    });
});

// 🧹 Cleanup Task (every 5 minutes)
setInterval(cleanupInactivePlayers, 5 * 60 * 1000);

// 🚀 Start Server
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎮 TOUCH WORLD MULTIPLAYER SERVER');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    console.log(`📊 Stats: http://localhost:${PORT}/stats`);
    console.log('═══════════════════════════════════════════════════════════');
});

// 🛡️ Error Handling
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
