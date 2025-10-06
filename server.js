import express from 'npm:express@4.18.2';
import { createServer } from 'node:http';
import { Server } from 'npm:socket.io@4.6.1';

const app = express();
const httpServer = createServer(app);

// 🔐 CORS Configuration
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

// 📊 Game State
const rooms = new Map();
const playerToRoom = new Map();
const socketToPlayer = new Map();
const playerAfkStatus = new Map();
const serverStartTime = Date.now();

// 🏥 Health Check
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
        memory: {
            rss: Deno.memoryUsage().rss,
            heapTotal: Deno.memoryUsage().heapTotal,
            heapUsed: Deno.memoryUsage().heapUsed,
            external: Deno.memoryUsage().external
        }
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

            console.log('👤 Player joining:', {
                username: playerData.username,
                skin_code: playerData.skin_code
            });

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

            console.log(`👤 Player ${playerData.username} (${playerId}) joined ${roomId}`);

            const existingPlayers = Array.from(room.players.values())
                .filter(p => p.id !== playerId);
            
            console.log(`📤 Sending ${existingPlayers.length} existing players to new player`);
            socket.emit('playersUpdate', { players: existingPlayers });

            socket.to(roomId).emit('playerJoined', playerData);

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

    // 💤 Player AFK Status
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

            console.log(`💤 Player ${player.username} is ${isAfk ? 'AFK' : 'back'}`);

            io.to(roomId).emit('playerAfkUpdate', {
                playerId,
                isAfk
            });

        } catch (error) {
            console.error('AFK status error:', error);
        }
    });

    // 💬 Chat Bubble
    socket.on('bubbleMessage', (data) => {
        try {
            const playerId = socketToPlayer.get(socket.id);
            if (!playerId) return;

            const roomId = playerToRoom.get(playerId);
            if (!roomId) return;

            io.to(roomId).emit('bubbleMessage', {
                ...data,
                timestamp: Date.now()
            });

            console.log(`💬 Bubble from ${data.username}: ${data.message}`);

        } catch (error) {
            console.error('Bubble error:', error);
        }
    });

    // 🤝 Trade Request
    socket.on('tradeRequest', (data) => {
        try {
            const { tradeId, initiator_id, receiver_id } = data;
            
            const receiverRoom = playerToRoom.get(receiver_id);
            if (!receiverRoom) return;

            const room = rooms.get(receiverRoom);
            if (!room) return;

            const receiverPlayer = room.players.get(receiver_id);
            if (!receiverPlayer) return;

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

            io.to(roomId).emit('tradeUpdate', {
                tradeId,
                status
            });

            console.log(`📊 Trade ${tradeId} updated: ${status}`);

        } catch (error) {
            console.error('Trade update error:', error);
        }
    });

    // 🚪 Disconnect
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
});

// 🔧 Helper Functions
function leaveRoom(socket, playerId, roomId) {
    socket.leave(roomId);
    
    const room = rooms.get(roomId);
    if (room) {
        room.players.delete(playerId);
        
        socket.to(roomId).emit('playerLeft', { playerId });
        
        if (room.players.size === 0) {
            rooms.delete(roomId);
            console.log(`🗑️ Room ${roomId} removed (empty)`);
        } else {
            broadcastRoomState(roomId);
        }
    }
    
    playerToRoom.delete(playerId);
    playerAfkStatus.delete(playerId);
}

function broadcastRoomState(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    const allPlayers = Array.from(room.players.values());
    
    console.log(`📡 Broadcasting ${allPlayers.length} players in ${roomId}`);
    
    io.to(roomId).emit('playersUpdate', { players: allPlayers });
}

// 🧹 Cleanup Inactive Players
setInterval(() => {
    const now = Date.now();
    const TIMEOUT = 60000;

    rooms.forEach((room, roomId) => {
        const playersToRemove = [];
        room.players.forEach((player, playerId) => {
            if (now - player.lastUpdate > TIMEOUT) {
                playersToRemove.push(playerId);
            }
        });

        playersToRemove.forEach(playerId => {
            console.log(`⏰ Removing inactive player: ${playerId}`);
            const player = room.players.get(playerId);

            let socketFound = false;
            if (player && player.socketId) {
                const socket = io.sockets.sockets.get(player.socketId);
                if (socket) {
                    leaveRoom(socket, playerId, roomId);
                    socketToPlayer.delete(socket.id);
                    socketFound = true;
                }
            }
            
            if (!socketFound) {
                room.players.delete(playerId);
                playerToRoom.delete(playerId);
                playerAfkStatus.delete(playerId);
                if (player && player.socketId) {
                    socketToPlayer.delete(player.socketId);
                }
                io.to(roomId).emit('playerLeft', { playerId });
            }
        });

        if (room.players.size === 0) {
            rooms.delete(roomId);
            console.log(`🗑️ Room ${roomId} removed (empty)`);
        } else if (playersToRemove.length > 0) {
            broadcastRoomState(roomId);
        }
    });
}, 30000);

// 🚀 Start Server
const PORT = Deno.env.get('PORT') || 3001;

httpServer.listen(PORT, () => {
    console.log(`🚀 Touch World Server v2.1 running on port ${PORT}`);
    console.log(`📊 Ready for connections`);
});
