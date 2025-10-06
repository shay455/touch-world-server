import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

// ═══════════════════════════════════════════════════════════
// 🎮 TOUCH WORLD SERVER v4.0 - PERFECT SYNC
// Rebuilt from scratch for perfect real-time synchronization
// ═══════════════════════════════════════════════════════════

const PORT = process.env.PORT || 10000;
const app = express();
const httpServer = createServer(app);

console.log('═══════════════════════════════════════');
console.log('🚀 Touch World Server v4.0');
console.log('   Perfect Synchronization');
console.log('═══════════════════════════════════════');

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

// ✅ Get full player data
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

// ✅ Get all players in room
function getRoomPlayers(roomId) {
    const players = [];
    for (const [id, player] of gameState.players.entries()) {
        if (player.roomId === roomId && !player.is_invisible) {
            players.push(getPlayerData(player));
        }
    }
    return players;
}

// Home page
app.get('/', (req, res) => {
    const uptime = Math.floor((Date.now() - gameState.startTime) / 1000);
    res.send(`
<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="UTF-8">
<title>Touch World Server</title>
<meta http-equiv="refresh" content="3">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;align-items:center;justify-content:center;color:#fff}
.c{background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);border-radius:20px;padding:40px;border:1px solid rgba(255,255,255,0.2);text-align:center;max-width:600px}
h1{font-size:3em;margin-bottom:20px}
.status{display:inline-block;width:15px;height:15px;background:#0f0;border-radius:50%;animation:pulse 2s infinite;margin-left:10px}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
.stats{margin-top:30px;display:grid;grid-template-columns:repeat(2,1fr);gap:20px}
.stat{background:rgba(255,255,255,0.15);padding:20px;border-radius:10px}
.big{font-size:2.5em;font-weight:bold;margin-bottom:5px}
.label{font-size:0.9em;opacity:0.8}
</style>
</head>
<body>
<div class="c">
<h1>🎮 Touch World Server</h1>
<p style="font-size:1.3em"><span class="status"></span>v4.0 Online - Perfect Sync</p>
<div class="stats">
<div class="stat"><div class="big">${gameState.players.size}</div><div class="label">👥 שחקנים מחוברים</div></div>
<div class="stat"><div class="big">${uptime}</div><div class="label">⏱️ שניות פעילות</div></div>
</div>
</div>
</body>
</html>
    `);
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', players: gameState.players.size, version: '4.0' });
});

// ✅ Socket.IO Events
io.on('connection', (socket) => {
    console.log('═══════════════════════════════════════');
    console.log('✅ Player connected:', socket.id);

    // ✅ JOIN - Player enters area
    socket.on('join', (data) => {
        const { playerId, areaId, playerData } = data;
        
        console.log('👤 JOIN EVENT');
        console.log('   Player:', playerData.username);
        console.log('   Area:', areaId);
        console.log('   Appearance:', {
            skin: playerData.skin_code,
            hair: playerData.equipped_hair,
            top: playerData.equipped_top
        });
        
        // Leave old room
        const current = gameState.players.get(playerId);
        if (current?.roomId) {
            socket.leave(`area_${current.roomId}`);
            io.to(`area_${current.roomId}`).emit('playerLeft', { playerId });
            console.log('   Left room:', current.roomId);
        }

        // Join new room
        socket.join(`area_${areaId}`);
        
        // Save player
        gameState.players.set(playerId, {
            ...playerData,
            id: playerId,
            socketId: socket.id,
            roomId: areaId,
            lastUpdate: Date.now()
        });

        // ✅ Send ALL existing players to new player
        const roomPlayers = getRoomPlayers(areaId);
        socket.emit('playersUpdate', { players: roomPlayers });
        console.log(`   Sent ${roomPlayers.length} existing players to ${playerData.username}`);
        
        // ✅ Broadcast new player to ALL existing players (with full appearance!)
        const newPlayerData = getPlayerData(gameState.players.get(playerId));
        socket.to(`area_${areaId}`).emit('playerJoined', newPlayerData);
        console.log(`   Broadcasted ${playerData.username} to all players in ${areaId}`);
        
        console.log('✅ JOIN completed successfully');
        console.log('═══════════════════════════════════════');
    });

    // ✅ PLAYER STATE - Only position updates
    socket.on('playerState', (data) => {
        const player = gameState.players.get(data.id);
        if (!player) return;

        // Update ONLY position data
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
        
        // Broadcast ONLY position to others
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
    });

    // ✅ APPEARANCE CHANGE - Real-time appearance updates
    socket.on('playerAppearanceChange', (data) => {
        const player = gameState.players.get(data.playerId);
        if (!player) return;

        console.log('═══════════════════════════════════════');
        console.log('👗 APPEARANCE CHANGE');
        console.log('   Player:', player.username);
        console.log('   Changes:', data);

        // Update appearance in server state
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

        // ✅ Broadcast to ALL players in room (including sender for confirmation)
        io.to(`area_${player.roomId}`).emit('playerAppearanceUpdate', {
            id: data.playerId,
            username: player.username,
            skin_code: player.skin_code,
            equipped_hair: player.equipped_hair,
            equipped_top: player.equipped_top,
            equipped_pants: player.equipped_pants,
            equipped_hat: player.equipped_hat,
            equipped_halo: player.equipped_halo,
            equipped_necklace: player.equipped_necklace,
            equipped_accessories: player.equipped_accessories,
            equipped_shoes: player.equipped_shoes,
            equipped_gloves: player.equipped_gloves
        });

        console.log('✅ Appearance broadcasted to all players');
        console.log('═══════════════════════════════════════');
    });

    // Chat bubble
    socket.on('bubbleMessage', (data) => {
        const player = gameState.players.get(data.playerId);
        if (player) {
            socket.to(`area_${player.roomId}`).emit('bubbleMessage', data);
        }
    });

    // Trade requests
    socket.on('tradeRequest', (data) => {
        const receiver = Array.from(gameState.players.values()).find(p => p.id === data.receiverId);
        if (receiver) {
            io.to(receiver.socketId).emit('tradeRequest', data);
        }
    });

    socket.on('tradeUpdate', (data) => {
        const initiator = gameState.players.get(data.initiatorId);
        const receiver = gameState.players.get(data.receiverId);
        if (initiator && receiver) {
            io.to(initiator.socketId).emit('tradeUpdate', data);
            io.to(receiver.socketId).emit('tradeUpdate', data);
        }
    });

    // AFK
    socket.on('afkStatusUpdate', (data) => {
        const player = gameState.players.get(data.playerId);
        if (player) {
            player.isAfk = data.isAfk;
            socket.to(`area_${player.roomId}`).emit('playerAfkUpdate', data);
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('❌ Player disconnected:', socket.id);
        
        for (const [playerId, player] of gameState.players.entries()) {
            if (player.socketId === socket.id) {
                io.to(`area_${player.roomId}`).emit('playerLeft', { playerId });
                gameState.players.delete(playerId);
                console.log(`   Removed ${player.username} from ${player.roomId}`);
                break;
            }
        }
    });
});

// Start server
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════');
    console.log(`✅ Server running on port ${PORT}`);
    console.log('   WebSocket: Ready');
    console.log('   HTTP: Ready');
    console.log('═══════════════════════════════════════');
});
