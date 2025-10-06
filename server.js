import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: [
            'http://localhost:3000',
            'http://localhost:5173',
            'https://base44.app',
            'https://*.base44.app',
            /\.base44\.app$/
        ],
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

app.use(express.json());

const rooms = new Map();
const playerToRoom = new Map();
const socketToPlayer = new Map();
const playerAfkStatus = new Map();
const serverStartTime = Date.now();

app.get('/', (req, res) => {
    const uptime = Math.floor((Date.now() - serverStartTime) / 1000);
    res.json({
        status: 'ok',
        service: 'Touch World Multiplayer Server',
        version: '2.1',
        players: socketToPlayer.size,
        rooms: rooms.size,
        uptime: uptime,
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    const uptime = Math.floor((Date.now() - serverStartTime) / 1000);
    res.json({ 
        status: 'healthy',
        uptime: uptime,
        memory: process.memoryUsage()
    });
});

io.on('connection', (socket) => {
    console.log(`✅ Player connected: ${socket.id}`);

    socket.on('join', (data) => {
        try {
            const { playerId, areaId, playerData } = data;
            
            if (!playerId || !areaId || !playerData) {
                socket.emit('error', { message: 'Invalid join data' });
                return;
            }

            const roomId = `area_${areaId}`;
            
            const oldRoom = playerToRoom.get(playerId);
            if (oldRoom && oldRoom !== roomId) {
                leaveRoom(socket, playerId, oldRoom);
            }

            socket.join(roomId);
            socketToPlayer.set(socket.id, playerId);
            playerToRoom.set(playerId, roomId);
            playerAfkStatus.set(playerId, false);

            if (!rooms.has(roomId)) {
                rooms.set(roomId, { players: new Map() });
            }

            const room = rooms.get(roomId);
            
            room.players.set(playerId, {
                ...playerData,
                socketId: socket.id,
                isAfk: false,
                lastUpdate: Date.now()
            });

            const existingPlayers = Array.from(room.players.values())
                .filter(p => p.id !== playerId);
            
            socket.emit('playersUpdate', { players: existingPlayers });
            socket.to(roomId).emit('playerJoined', playerData);
            broadcastRoomState(roomId);

        } catch (error) {
            console.error('Join error:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    socket.on('playerState', (data) => {
        try {
            const playerId = socketToPlayer.get(socket.id);
            if (!playerId) return;

            const roomId = playerToRoom.get(playerId);
            if (!roomId) return;

            const room = rooms.get(roomId);
            if (!room) return;

            const player = room.players.get(playerId);
            if (!player) return;

            Object.assign(player, data, {
                lastUpdate: Date.now()
            });

            socket.to(roomId).emit('playerStateUpdate', {
                playerId,
                ...data
            });

        } catch (error) {
            console.error('Player state error:', error);
        }
    });

    socket.on('playerAfk', (data) => {
        try {
            const { playerId, isAfk } = data;
            const roomId = playerToRoom.get(playerId);
            
            if (!roomId) return;

            const room = rooms.get(roomId);
            if (!room) return;

            const player = room.players.get(playerId);
            if (!player) return;

            player.isAfk = isAfk;
            playerAfkStatus.set(playerId, isAfk);

            io.to(roomId).emit('playerAfkUpdate', {
                playerId,
                isAfk
            });

        } catch (error) {
            console.error('AFK error:', error);
        }
    });

    socket.on('bubbleMessage', (data) => {
        try {
            const { playerId, message, username, adminLevel } = data;
            const roomId = playerToRoom.get(playerId);
            
            if (!roomId) return;

            socket.to(roomId).emit('bubbleMessage', {
                playerId,
                message,
                username,
                adminLevel
            });

        } catch (error) {
            console.error('Bubble message error:', error);
        }
    });

    socket.on('tradeRequest', (data) => {
        try {
            const { tradeId, initiatorId, receiverId } = data;
            const receiverRoom = playerToRoom.get(receiverId);
            
            if (!receiverRoom) return;

            const room = rooms.get(receiverRoom);
            if (!room) return;

            const receiverPlayer = room.players.get(receiverId);
            if (!receiverPlayer) return;

            io.to(receiverPlayer.socketId).emit('tradeRequest', {
                tradeId,
                initiatorId,
                receiverId
            });

        } catch (error) {
            console.error('Trade request error:', error);
        }
    });

    socket.on('tradeUpdate', (data) => {
        try {
            const { tradeId, status } = data;
            
            io.emit('tradeUpdate', {
                tradeId,
                status
            });

        } catch (error) {
            console.error('Trade update error:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log(`❌ Player disconnected: ${socket.id}`);
        
        const playerId = socketToPlayer.get(socket.id);
        if (playerId) {
            const roomId = playerToRoom.get(playerId);
            if (roomId) {
                leaveRoom(socket, playerId, roomId);
            }
            socketToPlayer.delete(socket.id);
            playerToRoom.delete(playerId);
            playerAfkStatus.delete(playerId);
        }
    });
});

function leaveRoom(socket, playerId, roomId) {
    try {
        const room = rooms.get(roomId);
        if (room) {
            room.players.delete(playerId);
            
            if (room.players.size === 0) {
                rooms.delete(roomId);
            } else {
                socket.to(roomId).emit('playerLeft', { playerId });
                broadcastRoomState(roomId);
            }
        }
        socket.leave(roomId);
    } catch (error) {
        console.error('Leave room error:', error);
    }
}

function broadcastRoomState(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const players = Array.from(room.players.values());
    io.to(roomId).emit('playersUpdate', { players });
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`🚀 Touch World Server running on port ${PORT}`);
});
