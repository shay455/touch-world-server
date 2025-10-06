import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

// 🌐 Environment Variables
const PORT = process.env.PORT || 10000;

// 🚀 Express App
const app = express();
const httpServer = createServer(app);

// 🔓 CORS Configuration
const allowedOrigins = [
    'http://localhost:5173',
    'https://preview--copy-565f73e8.base44.app',
    'https://base44.app',
    /\.base44\.app$/,
    /\.onrender\.com$/
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.some(allowed => 
            typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
        )) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json());

// 🎮 Socket.IO Configuration
const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (allowedOrigins.some(allowed => 
                typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
            )) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e8,
    connectTimeout: 45000
});

// 📊 Game State (In-Memory Only)
const gameState = {
    players: new Map(),
    startTime: Date.now()
};

// 🏠 Helper Functions
function getRoomPlayers(roomId) {
    return Array.from(gameState.players.values())
        .filter(p => p.roomId === roomId)
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
            is_invisible: p.is_invisible,
            is_moving: p.is_moving,
            animation_frame: p.animation_frame
        }));
}

function broadcastToRoom(roomId, event, data) {
    io.to(`area_${roomId}`).emit(event, data);
}

// 🔌 Socket.IO Connection Handler
io.on('connection', (socket) => {
    console.log('✅ Player connected:', socket.id);

    // 👋 Join Room
    socket.on('join', (data) => {
        try {
            const { playerId, areaId, playerData } = data;
            console.log(`👤 ${playerData.username} joining ${areaId}`);

            // Leave previous room
            const currentPlayer = gameState.players.get(playerId);
            if (currentPlayer?.roomId) {
                socket.leave(`area_${currentPlayer.roomId}`);
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

            // Notify others
            socket.to(`area_${areaId}`).emit('playerJoined', playerData);

            console.log(`✅ ${playerData.username} joined (${roomPlayers.length} players)`);
        } catch (error) {
            console.error('❌ Join error:', error);
        }
    });

    // 🏃 Player State Update
    socket.on('playerState', (data) => {
        try {
            const player = gameState.players.get(data.id);
            if (player) {
                Object.assign(player, data, { lastUpdate: Date.now() });
                socket.to(`area_${player.roomId}`).emit('playerStateUpdate', data);
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
            
            if (player) {
                console.log(`💬 ${username}: ${message}`);
                broadcastToRoom(player.roomId, 'bubbleMessage', {
                    playerId,
                    message,
                    username,
                    adminLevel,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            console.error('❌ Bubble error:', error);
        }
    });

    // 👗 Appearance Change
    socket.on('playerAppearanceChange', (data) => {
        try {
            const { playerId } = data;
            const player = gameState.players.get(playerId);
            
            if (player) {
                console.log(`👗 ${player.username} changed appearance`);
                Object.assign(player, data);
                socket.to(`area_${player.roomId}`).emit('playerAppearanceUpdate', {
                    ...data,
                    id: playerId,
                    username: player.username
                });
            }
        } catch (error) {
            console.error('❌ Appearance error:', error);
        }
    });

    // 💤 AFK Status
    socket.on('playerAfk', (data) => {
        try {
            const { playerId, isAfk } = data;
            const player = gameState.players.get(playerId);
            
            if (player) {
                player.isAfk = isAfk;
                console.log(`💤 ${player.username} ${isAfk ? 'AFK' : 'back'}`);
                broadcastToRoom(player.roomId, 'playerAfkUpdate', { playerId, isAfk });
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
                console.log(`🤝 Trade: ${initiatorId} → ${receiverId}`);
                io.to(receiver.socketId).emit('tradeRequest', { tradeId, initiatorId, receiverId });
            }
        } catch (error) {
            console.error('❌ Trade request error:', error);
        }
    });

    // 🔄 Trade Update
    socket.on('tradeUpdate', (data) => {
        try {
            const { tradeId, status } = data;
            console.log(`🔄 Trade ${tradeId}: ${status}`);
            io.emit('tradeUpdate', { tradeId, status });
        } catch (error) {
            console.error('❌ Trade update error:', error);
        }
    });

    // 🚪 Disconnect
    socket.on('disconnect', () => {
        try {
            console.log('❌ Player disconnected:', socket.id);
            
            for (const [playerId, player] of gameState.players.entries()) {
                if (player.socketId === socket.id) {
                    const roomId = player.roomId;
                    gameState.players.delete(playerId);
                    broadcastToRoom(roomId, 'playerLeft', { playerId });
                    console.log(`👋 ${player.username} left`);
                    break;
                }
            }
        } catch (error) {
            console.error('❌ Disconnect error:', error);
        }
    });
});

// 🔄 Periodic Updates (every 5 seconds)
setInterval(() => {
    try {
        const rooms = new Set(Array.from(gameState.players.values()).map(p => p.roomId));
        for (const roomId of rooms) {
            const players = getRoomPlayers(roomId);
            if (players.length > 0) {
                broadcastToRoom(roomId, 'playersUpdate', { players });
            }
        }
    } catch (error) {
        console.error('❌ Update error:', error);
    }
}, 5000);

// 🧹 Cleanup Inactive (every 30 seconds)
setInterval(() => {
    try {
        const now = Date.now();
        for (const [playerId, player] of gameState.players.entries()) {
            if (now - player.lastUpdate > 60000) {
                const roomId = player.roomId;
                gameState.players.delete(playerId);
                broadcastToRoom(roomId, 'playerLeft', { playerId });
                console.log(`🧹 Removed inactive: ${player.username}`);
            }
        }
    } catch (error) {
        console.error('❌ Cleanup error:', error);
    }
}, 30000);

// 🏥 Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        players: gameState.players.size,
        uptime: (Date.now() - gameState.startTime) / 1000,
        port: PORT
    });
});

// 🚀 Start Server
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════════════════');
    console.log('🎮 Touch World Multiplayer Server v2.1');
    console.log('═══════════════════════════════════════════════════');
    console.log(`✅ Server: http://0.0.0.0:${PORT}`);
    console.log(`🌐 WebSocket ready`);
    console.log(`📍 Health: http://0.0.0.0:${PORT}/health`);
    console.log('═══════════════════════════════════════════════════');
});

export default httpServer;
