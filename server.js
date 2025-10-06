import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const PORT = process.env.PORT || 10000;
const app = express();
const httpServer = createServer(app);

console.log('🚀 Touch World Server v3.1 - Perfect Sync');

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
    res.send(`
<!DOCTYPE html>
<html dir="rtl">
<head><meta charset="UTF-8"><title>Touch Server</title>
<meta http-equiv="refresh" content="3">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;align-items:center;justify-content:center;color:#fff}
.c{background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);border-radius:20px;padding:40px;border:1px solid rgba(255,255,255,0.2);text-align:center}
h1{font-size:3em;margin-bottom:20px}
.status{display:inline-block;width:15px;height:15px;background:#0f0;border-radius:50%;animation:pulse 2s infinite;margin-left:10px}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
.stats{margin-top:30px;display:grid;grid-template-columns:repeat(2,1fr);gap:20px}
.stat{background:rgba(255,255,255,0.15);padding:20px;border-radius:10px}
.big{font-size:2em;font-weight:bold}
</style>
</head>
<body>
<div class="c">
<h1>🎮 Touch World Server</h1>
<p style="font-size:1.2em"><span class="status"></span>v3.1 Online</p>
<div class="stats">
<div class="stat"><div class="big">${gameState.players.size}</div>שחקנים</div>
<div class="stat"><div class="big">${Math.floor((Date.now()-gameState.startTime)/1000)}</div>שניות</div>
</div>
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

    // ✅ JOIN - מסנכרן את כל השחקנים
    socket.on('join', (data) => {
        const { playerId, areaId, playerData } = data;
        
        console.log(`👤 ${playerData.username} joining ${areaId}`);
        console.log('   Appearance:', {
            skin: playerData.skin_code,
            hair: playerData.equipped_hair,
            top: playerData.equipped_top
        });
        
        // עזיבת חדר קודם
        const current = gameState.players.get(playerId);
        if (current?.roomId) {
            socket.leave(`area_${current.roomId}`);
            socket.to(`area_${current.roomId}`).emit('playerLeft', { playerId });
        }

        // הצטרפות לחדר חדש
        socket.join(`area_${areaId}`);
        
        // שמירה במצב
        gameState.players.set(playerId, {
            ...playerData,
            id: playerId,
            socketId: socket.id,
            roomId: areaId,
            lastUpdate: Date.now()
        });

        // ✅ שליחת כל השחקנים הקיימים לשחקן החדש
        const roomPlayers = getRoomPlayers(areaId);
        socket.emit('playersUpdate', { players: roomPlayers });
        
        // ✅ שידור השחקן החדש לכל השחקנים האחרים (כולל מראה!)
        const newPlayerData = getPlayerData(gameState.players.get(playerId));
        socket.to(`area_${areaId}`).emit('playerJoined', newPlayerData);
        
        console.log(`✅ ${playerData.username} synced to ${roomPlayers.length} players`);
    });

    // ✅ MOVEMENT - רק position
    socket.on('playerState', (data) => {
        const player = gameState.players.get(data.id);
        if (player) {
            player.position_x = data.position_x;
            player.position_y = data.position_y;
            player.direction = data.direction;
            player.is_moving = data.is_moving;
            player.animation_frame = data.animation_frame;
            player.velocity_x = data.velocity_x || 0;
            player.velocity_y = data.velocity_y || 0;
            player.lastUpdate = Date.now();
            
            // שידור רק position לחדר
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

    // ✅ APPEARANCE CHANGE - מראה בזמן אמת!
    socket.on('playerAppearanceChange', (data) => {
        console.log('👗 Appearance change from:', data.playerId);
        console.log('   New appearance:', data);
        
        const player = gameState.players.get(data.playerId);
        if (player) {
            // עדכון מצב שרת
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
            
            // ✅ שידור לכל השחקנים בחדר (כולל השולח!)
            const fullAppearance = {
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
            };
            
            io.to(`area_${player.roomId}`).emit('playerAppearanceUpdate', fullAppearance);
            console.log(`✅ Broadcasted appearance to area_${player.roomId}`);
        }
    });

    // ✅ BUBBLE
    socket.on('sendBubbleMessage', (data) => {
        const { playerId, message, username, admin_level } = data;
        const player = gameState.players.get(playerId);
        
        if (player && message && message.length <= 150) {
            socket.to(`area_${player.roomId}`).emit('bubbleMessage', {
                playerId,
                message,
                username,
                admin_level,
                timestamp: Date.now()
            });
        }
    });

    // ✅ TRADE
    socket.on('sendTradeRequest', (data) => {
        const receiver = gameState.players.get(data.receiverId);
        if (receiver) {
            io.to(receiver.socketId).emit('tradeRequest', {
                tradeId: data.tradeId,
                initiator_id: data.initiatorId,
                receiver_id: data.receiverId
            });
        }
    });

    socket.on('sendTradeUpdate', (data) => {
        const { tradeId, status, participantIds } = data;
        if (participantIds) {
            participantIds.forEach(pid => {
                const p = gameState.players.get(pid);
                if (p) io.to(p.socketId).emit('tradeUpdate', { tradeId, status });
            });
        }
    });

    // ✅ AFK
    socket.on('playerAfkStatus', (data) => {
        const { playerId, isAfk } = data;
        const player = gameState.players.get(playerId);
        if (player) {
            player.isAfk = isAfk;
            socket.to(`area_${player.roomId}`).emit('playerAfkUpdate', { playerId, isAfk });
        }
    });

    // ✅ DISCONNECT
    socket.on('disconnect', () => {
        console.log('❌ Disconnected:', socket.id);
        
        for (const [playerId, player] of gameState.players.entries()) {
            if (player.socketId === socket.id) {
                socket.to(`area_${player.roomId}`).emit('playerLeft', { playerId });
                gameState.players.delete(playerId);
                console.log(`👋 ${player.username} left`);
                break;
            }
        }
    });
});

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
});
