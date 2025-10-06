import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const PORT = process.env.PORT || 10000;
const app = express();
const httpServer = createServer(app);

console.log('🚀 Touch World Server v4.0');

app.use(cors());
app.use(express.json());

const io = new Server(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

const gameState = {
    players: new Map(),
    startTime: Date.now()
};

function getPlayerData(player) {
    return {
        id: player.id,
        username: player.username,
        position_x: player.position_x,
        position_y: player.position_y,
        direction: player.direction,
        is_moving: player.is_moving,
        animation_frame: player.animation_frame,
        velocity_x: player.velocity_x || 0,
        velocity_y: player.velocity_y || 0,
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
    const players = [];
    for (const [id, player] of gameState.players.entries()) {
        if (player.roomId === roomId && !player.is_invisible) {
            players.push(getPlayerData(player));
        }
    }
    return players;
}

app.get('/', (req, res) => {
    const uptime = Math.floor((Date.now() - gameState.startTime) / 1000);
    res.send(`
<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="UTF-8"><title>Touch Server</title>
<meta http-equiv="refresh" content="3">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;align-items:center;justify-content:center;color:#fff}
.c{background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);border-radius:20px;padding:40px;text-align:center}
h1{font-size:3em}
.big{font-size:2em;font-weight:bold}
</style>
</head>
<body>
<div class="c">
<h1>🎮 Touch World</h1>
<p>v4.0 Online</p>
<p class="big">${gameState.players.size} שחקנים</p>
<p>${uptime} שניות</p>
</div>
</body>
</html>
    `);
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', players: gameState.players.size });
});

io.on('connection', (socket) => {
    console.log('✅ Connected:', socket.id);

    socket.on('join', (data) => {
        const { playerId, areaId, playerData } = data;
        console.log(`👤 ${playerData.username} joining ${areaId}`);
        
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
        
        const newPlayerData = getPlayerData(gameState.players.get(playerId));
        socket.to(`area_${areaId}`).emit('playerJoined', newPlayerData);
    });

    socket.on('playerState', (data) => {
        const player = gameState.players.get(data.id);
        if (!player) return;

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
            animation_frame: data.animation_frame
        });
    });

    socket.on('playerAppearanceChange', (data) => {
        const player = gameState.players.get(data.playerId);
        if (!player) return;

        Object.assign(player, {
            skin_code: data.skin_code || player.skin_code,
            equipped_hair: data.equipped_hair !== undefined ? data.equipped_hair : player.equipped_hair,
            equipped_top: data.equipped_top !== undefined ? data.equipped_top : player.equipped_top,
            equipped_pants: data.equipped_pants !== undefined ? data.equipped_pants : player.equipped_pants,
            equipped_hat: data.equipped_hat !== undefined ? data.equipped_hat : player.equipped_hat,
            equipped_halo: data.equipped_halo !== undefined ? data.equipped_halo : player.equipped_halo,
            equipped_necklace: data.equipped_necklace !== undefined ? data.equipped_necklace : player.equipped_necklace,
            equipped_accessories: data.equipped_accessories || player.equipped_accessories,
            equipped_shoes: data.equipped_shoes !== undefined ? data.equipped_shoes : player.equipped_shoes,
            equipped_gloves: data.equipped_gloves !== undefined ? data.equipped_gloves : player.equipped_gloves
        });
        
        io.to(`area_${player.roomId}`).emit('playerAppearanceUpdate', getPlayerData(player));
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
                console.log(`👋 ${player.username} left`);
                break;
            }
        }
    });
});

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

