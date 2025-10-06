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
    pingInterval: 25000
});

const gameState = {
    rooms: new Map(),
    players: new Map(),
    startTime: Date.now()
};

function getRoomPlayers(roomId) {
    return Array.from(gameState.players.values()).filter(p => p.roomId === roomId);
}

function broadcastToRoom(roomId, event, data) {
    io.to(`area_${roomId}`).emit(event, data);
}

io.on('connection', (socket) => {
    console.log('✅ New player connected:', socket.id);

    socket.on('join', (data) => {
        const { playerId, areaId, playerData } = data;
        console.log(`👤 Player ${playerData.username} joining area: ${areaId}`);

        const currentPlayer = gameState.players.get(playerId);
        if (currentPlayer?.roomId) {
            socket.leave(`area_${currentPlayer.roomId}`);
        }

        socket.join(`area_${areaId}`);
        
        gameState.players.set(playerId, {
            ...playerData,
            socketId: socket.id,
            roomId: areaId,
            lastUpdate: Date.now()
        });

        const roomPlayers = getRoomPlayers(areaId);
        socket.emit('playersUpdate', { players: roomPlayers });
        socket.to(`area_${areaId}`).emit('playerJoined', playerData);

        console.log(`✅ Player ${playerData.username} joined successfully`);
    });

    socket.on('playerState', (data) => {
        const player = gameState.players.get(data.id);
        if (player) {
            Object.assign(player, data, { lastUpdate: Date.now() });
            socket.to(`area_${player.roomId}`).emit('playerStateUpdate', data);
        }
    });

    socket.on('bubbleMessage', (data) => {
        const { playerId, message, username, adminLevel } = data;
        const player = gameState.players.get(playerId);
        
        if (player) {
            broadcastToRoom(player.roomId, 'bubbleMessage', {
                playerId,
                message,
                username,
                adminLevel,
                timestamp: Date.now()
            });
        }
    });

    socket.on('playerAppearanceChange', (data) => {
        const { playerId } = data;
        const player = gameState.players.get(playerId);
        
        if (player) {
            Object.assign(player, data);
            socket.to(`area_${player.roomId}`).emit('playerAppearanceUpdate', {
                ...data,
                username: player.username
            });
        }
    });

    socket.on('playerAfk', (data) => {
        const { playerId, isAfk } = data;
        const player = gameState.players.get(playerId);
        
        if (player) {
            player.isAfk = isAfk;
            broadcastToRoom(player.roomId, 'playerAfkUpdate', { playerId, isAfk });
        }
    });

    socket.on('tradeRequest', (data) => {
        const { tradeId, initiatorId, receiverId } = data;
        const receiver = gameState.players.get(receiverId);
        if (receiver) {
            io.to(receiver.socketId).emit('tradeRequest', { tradeId, initiatorId, receiverId });
        }
    });

    socket.on('tradeUpdate', (data) => {
        const { tradeId, status } = data;
        io.emit('tradeUpdate', { tradeId, status });
    });

    socket.on('disconnect', () => {
        console.log('❌ Player disconnected:', socket.id);
        
        for (const [playerId, player] of gameState.players.entries()) {
            if (player.socketId === socket.id) {
                const roomId = player.roomId;
                gameState.players.delete(playerId);
                broadcastToRoom(roomId, 'playerLeft', { playerId });
                console.log(`👋 Player ${player.username} left`);
                break;
            }
        }
    });
});

setInterval(() => {
    for (const [roomId, room] of gameState.rooms) {
        const players = getRoomPlayers(roomId);
        broadcastToRoom(roomId, 'playersUpdate', { players });
    }
}, 5000);

setInterval(() => {
    const now = Date.now();
    const TIMEOUT = 60000;
    
    for (const [playerId, player] of gameState.players.entries()) {
        if (now - player.lastUpdate > TIMEOUT) {
            const roomId = player.roomId;
            gameState.players.delete(playerId);
            broadcastToRoom(roomId, 'playerLeft', { playerId });
            console.log(`🧹 Removed inactive player: ${player.username}`);
        }
    }
}, 30000);

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        players: gameState.players.size,
        rooms: gameState.rooms.size,
        uptime: (Date.now() - gameState.startTime) / 1000
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('🎮 Touch World Multiplayer Server');
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 WebSocket ready for connections`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
});

export default httpServer;
package.json:
{
  "name": "touch-world-server",
  "version": "2.0.0",
  "type": "module",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.6.1",
    "cors": "^2.8.5"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
