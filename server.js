import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const PORT = process.env.PORT || 10000;

const app = express();
const httpServer = createServer(app);

// 🔓 CORS Configuration - הוסף את הדומיין שלך!
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://preview--copy-565f73e8.base44.app',
    'https://base44.app',
    'https://touch-world.io',              // ✅ הוסף את זה!
    'https://www.touch-world.io',          // ✅ הוסף את זה!
    /\.base44\.app$/,
    /\.touch-world\.io$/,                  // ✅ הוסף את זה!
    /\.onrender\.com$/
];

const corsOptions = {
    origin: (origin, callback) => {
        // אפשר בקשות ללא origin (כמו Postman, mobile apps)
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

// 📊 Game State
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
    const timeout = 5 * 60 * 1000;
    
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

// 🔌 Socket.IO Events
io.on('connection', (socket) => {
    console.log('✅ Player connected:', socket.id);

    socket.on('join', (data) => {
        try {
            const { playerId, areaId, playerData } = data;
            
            if (!playerId || !areaId || !playerData) {
                console.error('❌ Invalid join data');
                return;
            }

            console.log(`👤 ${playerData.username} joining ${areaId}`);

            const currentPlayer = gameState.players.get(playerId);
            if (currentPlayer?.roomId) {
                socket.leave(`area_${currentPlayer.roomId}`);
                socket.to(`area_${currentPlayer.roomId}`).emit('playerLeft', { playerId });
            }

            socket.join(`area_${areaId}`);
            
            gameState.players.set(playerId, {
                ...playerData,
                socketId: socket.id,
                roomId: areaId,
                lastUpdate: Date.now(),
                isAfk: false
            });

            const roomPlayers = getRoomPlayers(areaId);
            socket.emit('playersUpdate', { players: roomPlayers });
            socket.to(`area_${areaId}`).emit('playerJoined', playerData);

            console.log(`✅ ${playerData.username} joined (${roomPlayers.length} players)`);
        } catch (error) {
            console.error('❌ Join error:', error);
        }
    });

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

    socket.on('playerAppearanceChange', (data) => {
        try {
            const { playerId } = data;
            const player = gameState.players.get(playerId);
            
            if (player) {
                Object.assign(player, data);
                console.log(`👗 ${player.username} changed appearance`);
                socket.to(`area_${player.roomId}`).emit('playerAppearanceUpdate', {
                    ...data,
                    username: player.username
                });
            }
        } catch (error) {
            console.error('❌ Appearance error:', error);
        }
    });

    socket.on('playerAfk', (data) => {
        try {
            const { playerId, isAfk } = data;
            const player = gameState.players.get(playerId);
            
            if (player) {
                player.isAfk = isAfk;
                broadcastToRoom(player.roomId, 'playerAfkUpdate', { playerId, isAfk });
            }
        } catch (error) {
            console.error('❌ AFK error:', error);
        }
    });

    socket.on('tradeRequest', (data) => {
        try {
            const { tradeId, initiatorId, receiverId } = data;
            const receiver = gameState.players.get(receiverId);
            
            if (receiver) {
                io.to(receiver.socketId).emit('tradeRequest', { tradeId, initiatorId, receiverId });
            }
        } catch (error) {
            console.error('❌ Trade request error:', error);
        }
    });

    socket.on('tradeUpdate', (data) => {
        try {
            const { tradeId, status } = data;
            io.emit('tradeUpdate', { tradeId, status });
        } catch (error) {
            console.error('❌ Trade update error:', error);
        }
    });

    socket.on('disconnect', () => {
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
    });
});

// 🔄 Periodic Updates
setInterval(() => {
    for (const [roomId] of gameState.rooms) {
        const players = getRoomPlayers(roomId);
        broadcastToRoom(roomId, 'playersUpdate', { players });
    }
}, 5000);

setInterval(cleanupInactivePlayers, 30000);

// 🏥 Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        players: gameState.players.size,
        rooms: gameState.rooms.size,
        uptime: Math.floor((Date.now() - gameState.startTime) / 1000),
        port: PORT
    });
});

app.get('/', (req, res) => {
    res.json({
        name: 'Touch World Multiplayer Server',
        version: '2.1.0',
        status: 'running',
        players: gameState.players.size
    });
});

// 🚀 Start Server
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════');
    console.log('🎮 TOUCH WORLD MULTIPLAYER SERVER');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    console.log(`🔌 WebSocket ready for connections`);
    console.log('═══════════════════════════════════════');
});

export default httpServer;
