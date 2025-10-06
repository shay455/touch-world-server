import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const PORT = process.env.PORT || 10000;
const app = express();
const httpServer = createServer(app);

const corsOptions = {
    origin: true,
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

const io = new Server(httpServer, {
    cors: corsOptions,
    transports: ['websocket', 'polling']
});

const gameState = {
    players: new Map(),
    startTime: Date.now()
};

function getFullPlayerData(player) {
    return {
        id: player.id,
        username: player.username,
        position_x: player.position_x ?? 600,
        position_y: player.position_y ?? 400,
        direction: player.direction ?? 'front',
        is_moving: player.is_moving ?? false,
        animation_frame: player.animation_frame ?? 'idle',
        velocity_x: player.velocity_x ?? 0,
        velocity_y: player.velocity_y ?? 0,
        skin_code: player.skin_code,
        equipped_hair: player.equipped_hair,
        equipped_top: player.equipped_top,
        equipped_pants: player.equipped_pants,
        equipped_hat: player.equipped_hat,
        equipped_halo: player.equipped_halo,
        equipped_necklace: player.equipped_necklace,
        equipped_accessories: player.equipped_accessories || [],
        equipped_shoes: player.equipped_shoes,
        equipped_gloves: player.equipped_gloves,
        admin_level: player.admin_level || 'user',
        is_invisible: player.is_invisible || false,
        isAfk: player.isAfk || false
    };
}

function getRoomPlayers(roomId) {
    return Array.from(gameState.players.values())
        .filter(p => p.roomId === roomId && !p.is_invisible)
        .map(getFullPlayerData);
}

app.get('/', (req, res) => {
    res.send('<h1>🎮 Touch World Server Online</h1><p>Players: ' + gameState.players.size + '</p>');
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', players: gameState.players.size });
});

io.on('connection', (socket) => {
    console.log('✅ Player connected:', socket.id);

    socket.on('join', (data) => {
        const { playerId, areaId, playerData } = data;
        
        const current = gameState.players.get(playerId);
        if (current?.roomId) {
            socket.leave(`area_${current.roomId}`);
            socket.to(`area_${current.roomId}`).emit('playerLeft', { playerId });
        }

        socket.join(`area_${areaId}`);
        
        gameState.players.set(playerId, {
            ...playerData,
            id: playerId,
            socketId: socket.id,
            roomId: areaId,
            lastUpdate: Date.now()
        });

        const roomPlayers = getRoomPlayers(areaId);
        socket.emit('playersUpdate', { players: roomPlayers });
        socket.to(`area_${areaId}`).emit('playerJoined', getFullPlayerData(gameState.players.get(playerId)));
        
        console.log(`✅ ${playerData.username} joined ${areaId}`);
    });

    socket.on('playerState', (data) => {
        const player = gameState.players.get(data.id);
        if (player) {
            Object.assign(player, {
                position_x: data.position_x,
                position_y: data.position_y,
                direction: data.direction,
                is_moving: data.is_moving,
                animation_frame: data.animation_frame,
                velocity_x: data.velocity_x || 0,
                velocity_y: data.velocity_y || 0,
                lastUpdate: Date.now()
            });
            
            socket.to(`area_${player.roomId}`).emit('playerStateUpdate', {
                id: data.id,
                position_x: data.position_x,
                position_y: data.position_y,
                direction: data.direction,
                is_moving: data.is_moving,
                animation_frame: data.animation_frame,
                velocity_x: data.velocity_x,
                velocity_y: data.velocity_y
            });
        }
    });

    socket.on('playerAppearanceChange', (data) => {
        const player = gameState.players.get(data.playerId);
        if (player) {
            Object.assign(player, {
                skin_code: data.skin_code ?? player.skin_code,
                equipped_hair: data.equipped_hair ?? player.equipped_hair,
                equipped_top: data.equipped_top ?? player.equipped_top,
                equipped_pants: data.equipped_pants ?? player.equipped_pants,
                equipped_hat: data.equipped_hat ?? player.equipped_hat,
                equipped_halo: data.equipped_halo ?? player.equipped_halo,
                equipped_necklace: data.equipped_necklace ?? player.equipped_necklace,
                equipped_accessories: data.equipped_accessories ?? player.equipped_accessories,
                equipped_shoes: data.equipped_shoes ?? player.equipped_shoes,
                equipped_gloves: data.equipped_gloves ?? player.equipped_gloves
            });
            
            io.to(`area_${player.roomId}`).emit('playerAppearanceUpdate', getFullPlayerData(player));
        }
    });

    socket.on('bubbleMessage', (data) => {
        const player = gameState.players.get(data.playerId);
        if (player) {
            io.to(`area_${player.roomId}`).emit('bubbleMessage', {
                playerId: data.playerId,
                message: data.message,
                username: data.username,
                adminLevel: data.adminLevel || 'user',
                timestamp: Date.now()
            });
        }
    });

    socket.on('playerAfk', (data) => {
        const player = gameState.players.get(data.playerId);
        if (player) {
            player.isAfk = data.isAfk;
            io.to(`area_${player.roomId}`).emit('playerAfkUpdate', { 
                playerId: data.playerId, 
                isAfk: data.isAfk 
            });
        }
    });

    socket.on('disconnect', () => {
        for (const [playerId, player] of gameState.players.entries()) {
            if (player.socketId === socket.id) {
                gameState.players.delete(playerId);
                io.to(`area_${player.roomId}`).emit('playerLeft', { playerId });
                console.log(`👋 ${player.username} disconnected`);
                break;
            }
        }
    });
});

httpServer.listen(PORT, () => {
    console.log(`🎮 Touch World Server running on port ${PORT}`);
});
package.json:
{
  "name": "touch-world-server",
  "version": "2.9.0",
  "type": "module",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.6.1",
    "cors": "^2.8.5"
  }
}
