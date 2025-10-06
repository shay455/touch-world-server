import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());

const rooms = new Map();
const playerToRoom = new Map();
const socketToPlayer = new Map();

app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Touch World Server',
        players: socketToPlayer.size,
        rooms: rooms.size
    });
});

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('join', (data) => {
        const { playerId, areaId, playerData } = data;
        const roomId = `area_${areaId}`;
        
        socket.join(roomId);
        socketToPlayer.set(socket.id, playerId);
        playerToRoom.set(playerId, roomId);

        if (!rooms.has(roomId)) {
            rooms.set(roomId, { players: new Map() });
        }

        const room = rooms.get(roomId);
        room.players.set(playerId, {
            ...playerData,
            socketId: socket.id,
            lastUpdate: Date.now()
        });

        const existingPlayers = Array.from(room.players.values())
            .filter(p => p.id !== playerId);
        
        socket.emit('playersUpdate', { players: existingPlayers });
        socket.to(roomId).emit('playerJoined', playerData);
    });

    socket.on('playerState', (data) => {
        const playerId = socketToPlayer.get(socket.id);
        if (!playerId) return;

        const roomId = playerToRoom.get(playerId);
        if (!roomId) return;

        socket.to(roomId).emit('playerStateUpdate', {
            playerId,
            ...data
        });
    });

    socket.on('bubbleMessage', (data) => {
        const playerId = socketToPlayer.get(socket.id);
        if (!playerId) return;

        const roomId = playerToRoom.get(playerId);
        if (!roomId) return;

        io.to(roomId).emit('bubbleMessage', data);
    });

    socket.on('disconnect', () => {
        const playerId = socketToPlayer.get(socket.id);
        if (!playerId) return;

        const roomId = playerToRoom.get(playerId);
        if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
                room.players.delete(playerId);
                socket.to(roomId).emit('playerLeft', { playerId });
            }
        }

        socketToPlayer.delete(socket.id);
        playerToRoom.delete(playerId);
    });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
