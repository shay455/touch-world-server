import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

// ═══════════════════════════════════════════════════════════
// 🎮 TOUCH WORLD MULTIPLAYER SERVER v3.0
// Perfect Synchronization - Rebuilt from Scratch
// ═══════════════════════════════════════════════════════════

const PORT = process.env.PORT || 10000;
const app = express();
const httpServer = createServer(app);

console.log('═══════════════════════════════════════');
console.log('🚀 Touch World Server v3.0 Starting...');
console.log('═══════════════════════════════════════');

// ✅ CORS - פשוט ועובד
app.use(cors());
app.use(express.json());

// ✅ Socket.IO - הגדרות פשוטות
const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// 📊 מצב המשחק
const gameState = {
    players: new Map(),
    rooms: new Map(),
    startTime: Date.now()
};

// ✅ פונקציה: קבל נתוני שחקן מלאים
function getPlayerData(player) {
    return {
        // Basic
        id: player.id,
        username: player.username,
        
        // Position
        position_x: player.position_x,
        position_y: player.position_y,
        direction: player.direction,
        is_moving: player.is_moving,
        animation_frame: player.animation_frame,
        velocity_x: player.velocity_x || 0,
        velocity_y: player.velocity_y || 0,
        
        // Appearance - ללא ברירות מחדל!
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
        
        // Status
        admin_level: player.admin_level || 'user',
        is_invisible: player.is_invisible || false,
        isAfk: player.isAfk || false
    };
}

// ✅ פונקציה: קבל שחקנים בחדר
function getRoomPlayers(roomId) {
    const players = [];
    for (const [id, player] of gameState.players.entries()) {
        if (player.roomId === roomId && !player.is_invisible) {
            players.push(getPlayerData(player));
        }
    }
    return players;
}

// 🏠 דף בית
app.get('/', (req, res) => {
    const uptime = Math.floor((Date.now() - gameState.startTime) / 1000);
    res.send(`
<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Touch World Server</title>
    <meta http-equiv="refresh" content="3">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }
        .container {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            border: 1px solid rgba(255,255,255,0.2);
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 600px;
        }
        h1 { font-size: 3em; margin-bottom: 20px; }
        .status {
            display: inline-block;
            width: 15px;
            height: 15px;
            background: #00ff00;
            border-radius: 50%;
            animation: pulse 2s infinite;
            margin-left: 10px;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .stats {
            margin-top: 30px;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
        }
        .stat {
            background: rgba(255,255,255,0.15);
            padding: 20px;
            border-radius: 10px;
        }
        .stat-value {
            font-size: 2em;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .stat-label {
            font-size: 0.9em;
            opacity: 0.8;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎮 Touch World Server</h1>
        <p style="font-size: 1.2em;">
            <span class="status"></span>
            Server Online v3.0
        </p>
        <div class="stats">
            <div class="stat">
                <div class="stat-value">${gameState.players.size}</div>
                <div class="stat-label">👥 שחקנים מחוברים</div>
            </div>
            <div class="stat">
                <div class="stat-value">${Math.floor(uptime / 60)}m</div>
                <div class="stat-label">⏱️ זמן פעילות</div>
            </div>
        </div>
    </div>
</body>
</html>
    `);
});

// 🏥 Health Check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        version: '3.0',
        players: gameState.players.size,
        uptime: Math.floor((Date.now() - gameState.startTime) / 1000)
    });
});

// 🎮 Socket.IO - לוגיקת המשחק
io.on('connection', (socket) => {
    console.log('✅ New connection:', socket.id);

    // 🚪 הצטרפות לחדר
    socket.on('join', (data) => {
        try {
            const { playerId, areaId, playerData } = data;
            
            console.log('═══════════════════════════════════════');
            console.log('🚪 Player joining:');
            console.log('   ID:', playerId);
            console.log('   Username:', playerData.username);
            console.log('   Area:', areaId);
            console.log('   Skin:', playerData.skin_code);
            console.log('   Hair:', playerData.equipped_hair);
            console.log('   Top:', playerData.equipped_top);
            console.log('═══════════════════════════════════════');

            // אם השחקן כבר בחדר אחר, תוציא אותו
            const existingPlayer = gameState.players.get(playerId);
            if (existingPlayer && existingPlayer.roomId) {
                socket.leave(`area_${existingPlayer.roomId}`);
                socket.to(`area_${existingPlayer.roomId}`).emit('playerLeft', { playerId });
            }

            // הצטרף לחדר החדש
            socket.join(`area_${areaId}`);

            // שמור את השחקן
            gameState.players.set(playerId, {
                ...playerData,
                id: playerId,
                socketId: socket.id,
                roomId: areaId,
                lastUpdate: Date.now()
            });

            // שלח לשחקן את כל השחקנים בחדר
            const roomPlayers = getRoomPlayers(areaId);
            socket.emit('playersUpdate', { players: roomPlayers });

            // הודע לכולם על שחקן חדש
            const newPlayerData = getPlayerData(gameState.players.get(playerId));
            socket.to(`area_${areaId}`).emit('playerJoined', newPlayerData);

            console.log(`✅ ${playerData.username} joined ${areaId} successfully`);
            console.log(`📊 Total players in ${areaId}:`, roomPlayers.length);

        } catch (error) {
            console.error('❌ Join error:', error);
        }
    });

    // 🏃 עדכון מיקום
    socket.on('playerState', (data) => {
        try {
            const player = gameState.players.get(data.id);
            if (!player) return;

            // עדכן מיקום
            player.position_x = data.position_x;
            player.position_y = data.position_y;
            player.direction = data.direction;
            player.is_moving = data.is_moving;
            player.animation_frame = data.animation_frame;
            player.velocity_x = data.velocity_x || 0;
            player.velocity_y = data.velocity_y || 0;
            player.lastUpdate = Date.now();

            // שלח לשחקנים אחרים
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
            console.error('❌ State update error:', error);
        }
    });

    // 👗 עדכון מראה
    socket.on('playerAppearanceChange', (data) => {
        try {
            const player = gameState.players.get(data.playerId);
            if (!player) return;

            console.log('═══════════════════════════════════════');
            console.log('👗 Appearance change:');
            console.log('   Player:', player.username);
            console.log('   Skin:', data.skin_code);
            console.log('   Hair:', data.equipped_hair);
            console.log('   Top:', data.equipped_top);
            console.log('═══════════════════════════════════════');

            // עדכן מראה
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

            // שלח לכולם (כולל עצמו!)
            io.to(`area_${player.roomId}`).emit('playerAppearanceUpdate', getPlayerData(player));

            console.log('✅ Appearance updated successfully');

        } catch (error) {
            console.error('❌ Appearance update error:', error);
        }
    });

    // 💬 בועת צ'אט
    socket.on('bubbleMessage', (data) => {
        try {
            const player = gameState.players.get(data.playerId);
            if (!player) return;

            io.to(`area_${player.roomId}`).emit('bubbleMessage', {
                playerId: data.playerId,
                message: data.message,
                username: data.username,
                adminLevel: data.adminLevel || 'user',
                timestamp: Date.now()
            });

        } catch (error) {
            console.error('❌ Bubble message error:', error);
        }
    });

    // 💤 AFK Status
    socket.on('playerAfk', (data) => {
        try {
            const player = gameState.players.get(data.playerId);
            if (!player) return;

            player.isAfk = data.isAfk;
            io.to(`area_${player.roomId}`).emit('playerAfkUpdate', { 
                playerId: data.playerId, 
                isAfk: data.isAfk 
            });

        } catch (error) {
            console.error('❌ AFK update error:', error);
        }
    });

    // 🤝 Trade Events
    socket.on('tradeRequest', (data) => {
        io.emit('tradeRequest', data);
    });

    socket.on('tradeUpdate', (data) => {
        io.emit('tradeUpdate', data);
    });

    // 👋 התנתקות
    socket.on('disconnect', () => {
        console.log('👋 Player disconnected:', socket.id);

        for (const [playerId, player] of gameState.players.entries()) {
            if (player.socketId === socket.id) {
                console.log(`   Username: ${player.username}`);
                console.log(`   From area: ${player.roomId}`);
                
                gameState.players.delete(playerId);
                io.to(`area_${player.roomId}`).emit('playerLeft', { playerId });
                break;
            }
        }
    });
});

// 🚀 הפעל שרת
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════');
    console.log(`✅ Touch World Server v3.0 Running`);
    console.log(`📍 Port: ${PORT}`);
    console.log(`🌐 Ready for connections!`);
    console.log('═══════════════════════════════════════');
});

// 🛡️ Error Handling
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('💥 Unhandled Rejection:', error);
});
