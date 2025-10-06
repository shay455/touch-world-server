import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

// 🔐 Environment Variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORT = process.env.PORT || 3000;

// ⚠️ Validate Environment Variables
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('SUPABASE_URL:', SUPABASE_URL ? '✅' : '❌');
    console.error('SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_KEY ? '✅' : '❌');
    process.exit(1);
}

// 🗄️ Supabase Client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// 🌐 Express App
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

// 📊 Game State (In-Memory)
const gameState = {
    rooms: new Map(),
    players: new Map(),
    startTime: Date.now()
};

// 🏠 Room Management
function getRoomPlayers(roomId) {
    return Array.from(gameState.players.values()).filter(p => p.roomId === roomId);
}

function broadcastToRoom(roomId, event, data) {
    io.to(`area_${roomId}`).emit(event, data);
}

// 💾 Update Player in Supabase
async function updatePlayerInDB(playerId, updates) {
    try {
        const { data, error } = await supabase
            .from('players')
            .update(updates)
            .eq('id', playerId);
        
        if (error) {
            console.error('❌ Failed to update player in DB:', error);
        }
    } catch (error) {
        console.error('❌ Supabase error:', error);
    }
}

// 🔌 Socket.IO Connection Handler
io.on('connection', (socket) => {
    console.log('✅ New player connected:', socket.id);

    // 👋 Player Join Room
    socket.on('join', async (data) => {
        try {
            const { playerId, areaId, playerData } = data;
            
            console.log(`👤 Player ${playerData.username} joining area: ${areaId}`);

            // Leave previous room
            const currentPlayer = gameState.players.get(playerId);
            if (currentPlayer?.roomId) {
                socket.leave(`area_${currentPlayer.roomId}`);
                console.log(`🚪 Player left area: ${currentPlayer.roomId}`);
            }

            // Join new room
            socket.join(`area_${areaId}`);
            console.log(`🚪 Player joined area: ${areaId}`);
            
            // Update player state in memory
            gameState.players.set(playerId, {
                ...playerData,
                socketId: socket.id,
                roomId: areaId,
                lastUpdate: Date.now(),
                isAfk: false
            });

            // Update player in database
            await updatePlayerInDB(playerId, {
                current_area: areaId,
                is_online: true,
                last_activity: new Date().toISOString()
            });

            // Send current room players to new player
            const roomPlayers = getRoomPlayers(areaId);
            socket.emit('playersUpdate', { players: roomPlayers });

            // Notify others about new player
            socket.to(`area_${areaId}`).emit('playerJoined', playerData);

            console.log(`✅ Player ${playerData.username} joined successfully (${roomPlayers.length} players in room)`);
        } catch (error) {
            console.error('❌ Join error:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    // 🏃 Player Movement/State Update
    socket.on('playerState', (data) => {
        try {
            const player = gameState.players.get(data.id);
            if (player) {
                // Update in-memory state
                Object.assign(player, data, { lastUpdate: Date.now() });
                
                // Broadcast to others in room
                socket.to(`area_${player.roomId}`).emit('playerStateUpdate', data);
            }
        } catch (error) {
            console.error('❌ Player state error:', error);
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
            console.error('❌ Bubble message error:', error);
        }
    });

    // 👗 Appearance Change
    socket.on('playerAppearanceChange', (data) => {
        try {
            const { playerId } = data;
            const player = gameState.players.get(playerId);
            
            if (player) {
                console.log(`👗 ${player.username} changed appearance`);
                
                // Update in-memory state
                Object.assign(player, data);
                
                // Broadcast to others in room
                socket.to(`area_${player.roomId}`).emit('playerAppearanceUpdate', {
                    ...data,
                    id: playerId,
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
                
                broadcastToRoom(player.roomId, 'playerAfkUpdate', { playerId, isAfk });
            }
        } catch (error) {
            console.error('❌ AFK status error:', error);
        }
    });

    // 🤝 Trade Request
    socket.on('tradeRequest', (data) => {
        try {
            const { tradeId, initiatorId, receiverId } = data;
            const receiver = gameState.players.get(receiverId);
            
            if (receiver) {
                console.log(`🤝 Trade request: ${initiatorId} → ${receiverId}`);
                io.to(receiver.socketId).emit('tradeRequest', { 
                    tradeId, 
                    initiatorId, 
                    receiverId 
                });
            }
        } catch (error) {
            console.error('❌ Trade request error:', error);
        }
    });

    // 🔄 Trade Update
    socket.on('tradeUpdate', (data) => {
        try {
            const { tradeId, status } = data;
            console.log(`🔄 Trade ${tradeId} status: ${status}`);
            io.emit('tradeUpdate', { tradeId, status });
        } catch (error) {
            console.error('❌ Trade update error:', error);
        }
    });

    // 🚪 Disconnect
    socket.on('disconnect', async () => {
        try {
            console.log('❌ Player disconnected:', socket.id);
            
            for (const [playerId, player] of gameState.players.entries()) {
                if (player.socketId === socket.id) {
                    const roomId = player.roomId;
                    
                    // Remove from memory
                    gameState.players.delete(playerId);
                    
                    // Update database
                    await updatePlayerInDB(playerId, {
                        is_online: false,
                        last_activity: new Date().toISOString()
                    });
                    
                    // Notify others
                    broadcastToRoom(roomId, 'playerLeft', { playerId });
                    
                    console.log(`👋 Player ${player.username} left (${getRoomPlayers(roomId).length} remaining)`);
                    break;
                }
            }
        } catch (error) {
            console.error('❌ Disconnect error:', error);
        }
    });
});

// 🔄 Periodic Room Updates (every 5 seconds)
setInterval(() => {
    try {
        for (const [roomId] of gameState.rooms) {
            const players = getRoomPlayers(roomId);
            if (players.length > 0) {
                broadcastToRoom(roomId, 'playersUpdate', { players });
            }
        }
    } catch (error) {
        console.error('❌ Periodic update error:', error);
    }
}, 5000);

// 🧹 Cleanup Inactive Players (every 30 seconds)
setInterval(() => {
    try {
        const now = Date.now();
        const TIMEOUT = 60000; // 1 minute
        
        for (const [playerId, player] of gameState.players.entries()) {
            if (now - player.lastUpdate > TIMEOUT) {
                const roomId = player.roomId;
                gameState.players.delete(playerId);
                broadcastToRoom(roomId, 'playerLeft', { playerId });
                console.log(`🧹 Removed inactive player: ${player.username}`);
                
                // Update database
                updatePlayerInDB(playerId, {
                    is_online: false,
                    last_activity: new Date().toISOString()
                });
            }
        }
    } catch (error) {
        console.error('❌ Cleanup error:', error);
    }
}, 30000);

// 🏥 Health Check Endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        players: gameState.players.size,
        rooms: gameState.rooms.size,
        uptime: (Date.now() - gameState.startTime) / 1000,
        env: {
            supabase_url: SUPABASE_URL ? '✅' : '❌',
            supabase_key: SUPABASE_SERVICE_KEY ? '✅' : '❌',
            port: PORT
        }
    });
});

// 🚀 Start Server
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════════════════');
    console.log('🎮 Touch World Multiplayer Server v2.0');
    console.log('═══════════════════════════════════════════════════');
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 WebSocket ready for connections`);
    console.log(`🗄️  Supabase: ${SUPABASE_URL ? '✅ Connected' : '❌ Not configured'}`);
    console.log(`📍 Health check: http://0.0.0.0:${PORT}/health`);
    console.log('═══════════════════════════════════════════════════');
});

export default httpServer;
