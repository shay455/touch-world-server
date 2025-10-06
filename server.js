import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const httpServer = createServer(app);

const allowedOrigins = [
    'http://localhost:5173',
    'https://preview--copy-565f73e8.base44.app',
    'https://base44.app',
    /\.base44\.app$/
];

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
    pingTimeout: 60000,
    pingInterval: 25000
});

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

// 🎮 Game State
const gameState = {
    players: new Map(),
    areas: new Map(),
    trades: new Map()
};

// 🔄 Helper Functions
function getPlayersInArea(areaId) {
    return Array.from(gameState.players.values()).filter(p => p.areaId === areaId);
}

function broadcastToArea(areaId, event, data) {
    const players = getPlayersInArea(areaId);
    players.forEach(p => {
        if (p.socketId) {
            io.to(p.socketId).emit(event, data);
        }
    });
}

// 📡 Socket Connection
io.on('connection', (socket) => {
    console.log('✅ Player connected:', socket.id);

    // 🎯 Join Room
    socket.on('joinRoom', (data) => {
        const { playerId, areaId, playerData } = data;
        
        gameState.players.set(playerId, {
            ...playerData,
            socketId: socket.id,
            areaId: areaId,
            lastActivity: Date.now()
        });

        socket.join(areaId);
        
        const playersInArea = getPlayersInArea(areaId);
        
        // שלח לשחקן החדש את כל השחקנים באזור
        socket.emit('playersUpdate', { players: playersInArea });
        
        // שלח לכל השחקנים באזור שהצטרף שחקן חדש
        socket.to(areaId).emit('playerJoined', gameState.players.get(playerId));
        
        console.log(`🎮 Player ${playerData.username} joined ${areaId}`);
    });

    // 🏃 Player Movement
    socket.on('playerState', (data) => {
        const player = Array.from(gameState.players.values()).find(p => p.socketId === socket.id);
        
        if (player && data) {
            Object.assign(player, data);
            player.lastActivity = Date.now();
            
            socket.to(player.areaId).emit('playerStateUpdate', data);
        }
    });

    // 💬 Chat Bubble
    socket.on('bubbleMessage', (data) => {
        const player = Array.from(gameState.players.values()).find(p => p.socketId === socket.id);
        
        if (player) {
            socket.to(player.areaId).emit('bubbleMessage', {
                playerId: data.playerId,
                message: data.message,
                username: data.username,
                adminLevel: data.adminLevel
            });
        }
    });

    // 🔄 Trade Request
    socket.on('tradeRequest', (data) => {
        const { tradeId, initiatorId, receiverId } = data;
        
        const receiver = gameState.players.get(receiverId);
        if (receiver && receiver.socketId) {
            io.to(receiver.socketId).emit('tradeRequest', { tradeId, initiatorId, receiverId });
        }
    });

    // 📦 Trade Update
    socket.on('tradeUpdate', (data) => {
        const { tradeId, status } = data;
        
        gameState.trades.set(tradeId, { ...gameState.trades.get(tradeId), status, updatedAt: Date.now() });
        
        io.emit('tradeUpdate', data);
    });

    // 👕 Appearance Update
    socket.on('playerAppearanceUpdate', (data) => {
        const player = gameState.players.get(data.id);
        
        if (player) {
            Object.assign(player, data);
            socket.to(player.areaId).emit('playerAppearanceUpdate', data);
        }
    });

    // 😴 AFK Update
    socket.on('playerAfkUpdate', (data) => {
        const { playerId, isAfk } = data;
        const player = gameState.players.get(playerId);
        
        if (player) {
            player.isAfk = isAfk;
            socket.to(player.areaId).emit('playerAfkUpdate', { playerId, isAfk });
        }
    });

    // 🚪 Disconnect
    socket.on('disconnect', () => {
        const player = Array.from(gameState.players.entries()).find(([_, p]) => p.socketId === socket.id);
        
        if (player) {
            const [playerId, playerData] = player;
            const areaId = playerData.areaId;
            
            gameState.players.delete(playerId);
            
            socket.to(areaId).emit('playerLeft', { playerId });
            
            console.log(`🚪 Player ${playerData.username} disconnected`);
        }
    });
});

// 🧹 Cleanup inactive players every 5 minutes
setInterval(() => {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes
    
    for (const [playerId, player] of gameState.players.entries()) {
        if (now - player.lastActivity > timeout) {
            gameState.players.delete(playerId);
            if (player.areaId) {
                io.to(player.areaId).emit('playerLeft', { playerId });
            }
            console.log(`🧹 Cleaned up inactive player: ${player.username}`);
        }
    }
}, 5 * 60 * 1000);

// ❤️ Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        players: gameState.players.size,
        uptime: process.uptime()
    });
});

app.get('/', (req, res) => {
    res.json({
        status: 'Touch World Multiplayer Server',
        version: '2.0.0',
        players: gameState.players.size
    });
});

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Touch World Server running on port ${PORT}`);
});
