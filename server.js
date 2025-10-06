import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const httpServer = createServer(app);

// 🔐 CORS Configuration
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(cors());
app.use(express.json());

// 📊 Game State
const rooms = new Map();
const playerToRoom = new Map();
const socketToPlayer = new Map();

// 🏥 Health Check
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Touch World Multiplayer Server',
        version: '2.0',
        players: socketToPlayer.size,
        rooms: rooms.size,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        connections: io.engine.clientsCount
    });
});

// 📊 Stats endpoint
app.get('/stats', (req, res) => {
    const roomStats = {};
    rooms.forEach((room, roomId) => {
        roomStats[roomId] = room.players.size;
    });
    
    res.json({
        totalPlayers: socketToPlayer.size,
        totalRooms: rooms.size,
        roomStats,
        timestamp: new Date().toISOString()
    });
});

// 🎮 Socket.IO Connection
io.on('connection', (socket) => {
    console.log(`✅ Player connected: ${socket.id}`);

    // 👋 Join Room
    socket.on('join', (data) => {
        try {
            const { playerId, areaId, playerData } = data;
            
            if (!playerId || !areaId || !playerData) {
                socket.emit('error', { message: 'Invalid join data' });
                return;
            }

            const roomId = `area_${areaId}`;
            
            // Leave previous room if exists
            const oldRoom = playerToRoom.get(playerId);
            if (oldRoom && oldRoom !== roomId) {
                leaveRoom(socket, playerId, oldRoom);
            }

            // Join new room
            socket.join(roomId);
            socketToPlayer.set(socket.id, playerId);
            playerToRoom.set(playerId, roomId);

            // Initialize room if needed
            if (!rooms.has(roomId)) {
                rooms.set(roomId, { players: new Map() });
            }

            const room = rooms.get(roomId);
            room.players.set(playerId, {
                ...playerData,
                socketId: socket.id,
                lastUpdate: Date.now()
            });

            console.log(`👤 Player ${playerData.username} (${playerId}) joined ${roomId}`);

            // Send current players to new player
            const existingPlayers = Array.from(room.players.values())
                .filter(p => p.id !== playerId);
            
            socket.emit('playersUpdate', { players: existingPlayers });

            // Notify others about new player
            socket.to(roomId).emit('playerJoined', playerData);

            // Send full room state
            broadcastRoomState(roomId);

        } catch (error) {
            console.error('Join error:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    // 📍 Player State Update
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

            // Update player state
            Object.assign(player, data, {
                lastUpdate: Date.now()
            });

            // Broadcast to others in room (not to sender)
            socket.to(roomId).emit('playerStateUpdate', {
                playerId,
                ...data
            });

        } catch (error) {
            console.error('Player state error:', error);
        }
    });

    // 💬 Chat Bubble
    socket.on('bubbleMessage', (data) => {
        try {
            const playerId = socketToPlayer.get(socket.id);
            if (!playerId) return;

            const roomId = playerToRoom.get(playerId);
            if (!roomId) return;

            // Broadcast bubble to entire room (including sender)
            io.to(roomId).emit('bubbleMessage', {
                ...data,
                timestamp: Date.now()
            });

            console.log(`💬 Bubble from ${data.username}: ${data.message}`);

        } catch (error) {
            console.error('Bubble error:', error);
        }
    });

    // 🔄 Trade Request
    socket.on('tradeRequest', (data) => {
        try {
            const { tradeId, initiator_id, receiver_id } = data;
            
            // Find receiver's socket
            const receiverRoom = playerToRoom.get(receiver_id);
            if (!receiverRoom) return;

            const room = rooms.get(receiverRoom);
            if (!room) return;

            const receiverPlayer = room.players.get(receiver_id);
            if (!receiverPlayer) return;

            // Send to receiver
            io.to(receiverPlayer.socketId).emit('tradeRequest', {
                tradeId,
                initiator_id,
                receiver_id
            });

            console.log(`🤝 Trade request: ${initiator_id} → ${receiver_id}`);

        } catch (error) {
            console.error('Trade request error:', error);
        }
    });

    // 📊 Trade Update
    socket.on('tradeUpdate', (data) => {
        try {
            const { tradeId, status } = data;
            const playerId = socketToPlayer.get(socket.id);
            if (!playerId) return;

            const roomId = playerToRoom.get(playerId);
            if (!roomId) return;

            // Broadcast to room
            io.to(roomId).emit('tradeUpdate', {
                tradeId,
                status
            });

            console.log(`📊 Trade ${tradeId} updated: ${status}`);

        } catch (error) {
            console.error('Trade update error:', error);
        }
    });

    // 🚪 Change Area
    socket.on('changeArea', (data) => {
        try {
            const { playerId, newAreaId, playerData } = data;
            
            const oldRoom = playerToRoom.get(playerId);
            if (!oldRoom) return;

            const newRoomId = `area_${newAreaId}`;
            
            // Leave old room
            leaveRoom(socket, playerId, oldRoom);
            
            // Join new room
            socket.leave(oldRoom);
            socket.join(newRoomId);
            playerToRoom.set(playerId, newRoomId);

            if (!rooms.has(newRoomId)) {
                rooms.set(newRoomId, { players: new Map() });
            }

            const newRoom = rooms.get(newRoomId);
            newRoom.players.set(playerId, {
                ...playerData,
                socketId: socket.id,
                lastUpdate: Date.now()
            });

            // Send existing players in new area
            const existingPlayers = Array.from(newRoom.players.values())
                .filter(p => p.id !== playerId);
            
            socket.emit('playersUpdate', { players: existingPlayers });
            
            // Notify new area about player
            socket.to(newRoomId).emit('playerJoined', playerData);

            console.log(`🚪 Player ${playerData.username} moved to ${newAreaId}`);

        } catch (error) {
            console.error('Change area error:', error);
        }
    });

    // 👋 Disconnect
    socket.on('disconnect', () => {
        try {
            const playerId = socketToPlayer.get(socket.id);
            if (!playerId) {
                console.log(`❌ Player disconnected: ${socket.id} (unknown)`);
                return;
            }

            const roomId = playerToRoom.get(playerId);
            if (roomId) {
                leaveRoom(socket, playerId, roomId);
            }

            socketToPlayer.delete(socket.id);
            console.log(`👋 Player ${playerId} disconnected`);

        } catch (error) {
            console.error('Disconnect error:', error);
        }
    });

    // ❤️ Ping/Pong for connection health
    socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
    });
});

// 🚪 Leave Room Helper
function leaveRoom(socket, playerId, roomId) {
    socket.leave(roomId);
    
    const room = rooms.get(roomId);
    if (room) {
        room.players.delete(playerId);
        
        // Notify others
        socket.to(roomId).emit('playerLeft', { playerId });
        
        // Remove empty rooms
        if (room.players.size === 0) {
            rooms.delete(roomId);
            console.log(`🗑️ Room ${roomId} removed (empty)`);
        } else {
            broadcastRoomState(roomId);
        }
    }
    
    playerToRoom.delete(playerId);
}

// 📡 Broadcast Room State
function broadcastRoomState(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const players = Array.from(room.players.values());
    io.to(roomId).emit('playersUpdate', { players });
}

// 🧹 Cleanup Inactive Players (every 60 seconds)
setInterval(() => {
    const now = Date.now();
    const TIMEOUT = 120000; // 2 minutes

    rooms.forEach((room, roomId) => {
        const toRemove = [];
        
        room.players.forEach((player, playerId) => {
            if (now - player.lastUpdate > TIMEOUT) {
                console.log(`⏰ Removing inactive player: ${playerId}`);
                toRemove.push(playerId);
            }
        });

        toRemove.forEach(playerId => {
            const socketId = room.players.get(playerId)?.socketId;
            room.players.delete(playerId);
            playerToRoom.delete(playerId);
            if (socketId) socketToPlayer.delete(socketId);
            
            io.to(roomId).emit('playerLeft', { playerId });
        });

        if (room.players.size === 0) {
            rooms.delete(roomId);
        }
    });
}, 60000);

// 🚀 Start Server
const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════╗
║  🎮 Touch World Multiplayer Server   ║
║  📡 Port: ${PORT.toString().padEnd(28)}║
║  ✅ Status: Running                   ║
║  🌐 Socket.IO: Ready                  ║
╚═══════════════════════════════════════╝
    `);
});

// 🛑 Graceful Shutdown
process.on('SIGTERM', () => {
    console.log('⚠️ SIGTERM received, shutting down gracefully...');
    httpServer.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});
