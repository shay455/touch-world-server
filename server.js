import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

// ═══════════════════════════════════════════════════════════
// 🎮 TOUCH WORLD SERVER v4.0 - PERFECT SYNC
// FIXED: Position and Appearance are separate updates!
// ═══════════════════════════════════════════════════════════

const PORT = process.env.PORT || 10000;
const app = express();
const httpServer = createServer(app);

console.log('═══════════════════════════════════════');
console.log('🚀 Touch World Server v4.0 Starting...');
console.log('═══════════════════════════════════════');

app.use(cors());
app.use(express.json());

const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

const gameState = {
    players: new Map(),
    startTime: Date.now()
};

// ✅ Get FULL player data
function getFullPlayerData(player) {
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
    return Array.from(gameState.players.values())
        .filter(p => p.roomId === roomId && !p.is_invisible)
        .map(getFullPlayerData);
}

// 🏠 Home
app.get('/', (req, res) => {
    const uptime = Math.floor((Date.now() - gameState.startTime) / 1000);
    res.send(`<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="UTF-8"><title>Touch World Server v4.0</title>
<meta http-equiv="refresh" content="3">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;align-items:center;justify-content:center;color:#fff}
.c{background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);border-radius:20px;padding:40px;border:1px solid rgba(255,255,255,0.2);text-align:center;max-width:600px}
h1{font-size:3em;margin-bottom:20px}
.status{display:inline-block;width:15px;height:15px;background:#00ff00;border-radius:50%;animation:pulse 2s infinite;margin-left:10px}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
.stats{margin-top:30px;display:grid;grid-template-columns:repeat(2,1fr);gap:20px}
.stat{background:rgba(255,255,255,0.15);padding:20px;border-radius:10px}
.stat-value{font-size:2em;font-weight:bold;margin-bottom:5px}
</style>
</head>
<body>
<div class="c">
<h1>🎮 Touch World Server</h1>
<p style="font-size:1.2em"><span class="status"></span>Online v4.0</p>
<div class="stats">
<div class="stat"><div class="stat-value">${gameState.players.size}</div>👥 שחקנים</div>
<div class="stat"><div class="stat-value">${Math.floor(uptime/60)}m</div>⏱️ זמן</div>
</div>
</div>
</body>
</html>`);
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '4.0', players: gameState.players.size });
});

// 🎮 Socket.IO
io.on('connection', (socket) => {
    console.log('✅ Connection:', socket.id);

    socket.on('join', (data) => {
        try {
            const { playerId, areaId, playerData } = data;
            
            console.log('═══════════════════════════════════════');
            console.log('🚪 JOIN:', playerData.username);
            console.log('   Area:', areaId);
            console.log('   Skin:', playerData.skin_code);
            console.log('   Hair:', playerData.equipped_hair);
            console.log('   Top:', playerData.equipped_top);
            console.log('═══════════════════════════════════════');

            // Remove from old room
            const existing = gameState.players.get(playerId);
            if (existing?.roomId) {
                socket.leave(`area_${existing.roomId}`);
                socket.to(`area_${existing.roomId}`).emit('playerLeft', { playerId });
            }

            // Join new room
            socket.join(`area_${areaId}`);

            // Save player with FULL data
            gameState.players.set(playerId, {
                ...playerData,
                id: playerId,
                socketId: socket.id,
                roomId: areaId,
                lastUpdate: Date.now()
            });

            // Send all room players to new player
            const roomPlayers = getRoomPlayers(areaId);
            socket.emit('playersUpdate', { players: roomPlayers });

            // Notify others
            const newPlayer = getFullPlayerData(gameState.players.get(playerId));
            socket.to(`area_${areaId}`).emit('playerJoined', newPlayer);

            console.log(`✅ ${playerData.username} joined (${roomPlayers.length} players in room)`);

        } catch (error) {
            console.error('❌ Join error:', error);
        }
    });

    socket.on('playerState', (data) => {
        try {
            const player = gameState.players.get(data.id);
            if (!player) return;

            // Update ONLY position - NOT appearance!
            player.position_x = data.position_x;
            player.position_y = data.position_y;
            player.direction = data.direction;
            player.is_moving = data.is_moving;
            player.animation_frame = data.animation_frame;
            player.velocity_x = data.velocity_x || 0;
            player.velocity_y = data.velocity_y || 0;
            player.lastUpdate = Date.now();

            // Send ONLY position update - NOT appearance!
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

        } catch (error) {
            console.error('❌ State error:', error);
        }
    });

    socket.on('playerAppearanceChange', (data) => {
        try {
            const player = gameState.players.get(data.playerId);
            if (!player) return;

            console.log('═══════════════════════════════════════');
            console.log('👗 APPEARANCE CHANGE:', player.username);
            console.log('   Skin:', data.skin_code);
            console.log('   Hair:', data.equipped_hair);
            console.log('   Top:', data.equipped_top);
            console.log('═══════════════════════════════════════');

            // Update ONLY appearance
            if (data.skin_code !== undefined) player.skin_code = data.skin_code;
            if (data.equipped_hair !== undefined) player.equipped_hair = data.equipped_hair;
            if (data.equipped_top !== undefined) player.equipped_top = data.equipped_top;
            if (data.equipped_pants !== undefined) player.equipped_pants = data.equipped_pants;
            if (data.equipped_hat !== undefined) player.equipped_hat = data.equipped_hat;
            if (data.equipped_halo !== undefined) player.equipped_halo = data.equipped_halo;
            if (data.equipped_necklace !== undefined) player.equipped_necklace = data.equipped_necklace;
            if (data.equipped_accessories !== undefined) player.equipped_accessories = data.equipped_accessories;
            if (data.equipped_shoes !== undefined) player.equipped_shoes = data.equipped_shoes;
            if (data.equipped_gloves !== undefined) player.equipped_gloves = data.equipped_gloves;

            // Send FULL appearance to everyone (including sender!)
            io.to(`area_${player.roomId}`).emit('playerAppearanceUpdate', getFullPlayerData(player));

            console.log('✅ Appearance updated');

        } catch (error) {
            console.error('❌ Appearance error:', error);
        }
    });

    socket.on('bubbleMessage', (data) => {
        try {
            const player = gameState.players.get(data.playerId);
            if (!player) return;
            io.to(`area_${player.roomId}`).emit('bubbleMessage', {...data, timestamp: Date.now()});
        } catch (error) {
            console.error('❌ Bubble error:', error);
        }
    });

    socket.on('playerAfk', (data) => {
        try {
            const player = gameState.players.get(data.playerId);
            if (!player) return;
            player.isAfk = data.isAfk;
            io.to(`area_${player.roomId}`).emit('playerAfkUpdate', { playerId: data.playerId, isAfk: data.isAfk });
        } catch (error) {
            console.error('❌ AFK error:', error);
        }
    });

    socket.on('tradeRequest', (data) => io.emit('tradeRequest', data));
    socket.on('tradeUpdate', (data) => io.emit('tradeUpdate', data));

    socket.on('disconnect', () => {
        console.log('👋 Disconnect:', socket.id);
        for (const [playerId, player] of gameState.players.entries()) {
            if (player.socketId === socket.id) {
                console.log(`   ${player.username} left ${player.roomId}`);
                gameState.players.delete(playerId);
                io.to(`area_${player.roomId}`).emit('playerLeft', { playerId });
                break;
            }
        }
    });
});

// 🚀 Start
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════');
    console.log(`✅ Server v4.0 Running on Port ${PORT}`);
    console.log('═══════════════════════════════════════');
});

process.on('uncaughtException', (error) => console.error('💥 Exception:', error));
process.on('unhandledRejection', (error) => console.error('💥 Rejection:', error));
