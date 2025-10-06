import { createServer } from 'http';
import { Server } from 'socket.io';
import { createClient } from '@base44/sdk-node';

// --- הגדרות ---
const PORT = process.env.PORT || 3000;
const SYNC_INTERVAL = 45; // ms

// --- הגדרות CORS ---
const allowedOrigins = [
    'http://localhost:5173',
    'https://copy-565f73e8.base44.app',
    'https://preview--copy-565f73e8.base44.app'
];

// --- אתחול החיבור ל-Base44 ---
const base44 = createClient({
    appUrl: process.env.BASE44_APP_URL,
    apiKey: process.env.BASE44_API_KEY
});

if (!process.env.BASE44_APP_URL || !process.env.BASE44_API_KEY) {
    console.error('❌ CRITICAL: BASE44_APP_URL or BASE44_API_KEY environment variables are not set!');
    // process.exit(1); // במצב ייצור, נרצה שהשרת יכשל אם אין לו גישה לדאטהבייס
}

// --- ניהול מצב המשחק ---
const areaPlayers = {};
const playerSockets = {};

// --- יצירת השרת ---
const httpServer = createServer((req, res) => {
    // Health check endpoint
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', players: Object.keys(playerSockets).length }));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Touch World Server is running!');
    }
});

const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
    }
});

// --- לוגיקת החיבור ---
io.on('connection', async (socket) => {
    const { playerId, areaId } = socket.handshake.query;

    if (!playerId || !areaId) {
        console.log(`🔌 Connection rejected: Missing query params.`);
        return socket.disconnect();
    }
    
    try {
        // --- אימות וטעינת נתוני שחקן מ-Base44 ---
        const player = await base44.entities.Player.get(playerId);
        if (!player) {
            console.error(`Auth Error: Player with ID ${playerId} not found.`);
            return socket.disconnect();
        }

        playerSockets[playerId] = socket.id;
        socket.join(areaId);

        if (!areaPlayers[areaId]) {
            areaPlayers[areaId] = {};
        }
        
        // שמירת האובייקט המלא מהדאטהבייס
        areaPlayers[areaId][playerId] = { ...player };

        console.log(`✅ ${player.username} (${playerId}) connected to area ${areaId}`);

        // --- עדכון סטטוס ב-Base44 ---
        await base44.entities.Player.update(playerId, { is_online: true, last_activity: new Date().toISOString() });

    } catch (error) {
        console.error(`Error during connection for player ${playerId}:`, error.message);
        return socket.disconnect();
    }


    // --- טיפול באירועים מהלקוח ---
    socket.on('playerState', (state) => {
        if (areaPlayers[areaId] && areaPlayers[areaId][playerId]) {
            Object.assign(areaPlayers[areaId][playerId], state);
        }
    });

    socket.on('bubbleMessage', (data) => {
        socket.to(areaId).emit('bubbleMessage', {
            playerId: data.playerId,
            message: data.message,
        });
    });

    socket.on('tradeRequest', (tradeId, initiatorId, receiverId) => {
        const receiverSocketId = playerSockets[receiverId];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('tradeRequest', { tradeId, initiatorId, receiverId });
        }
    });
    
    socket.on('tradeUpdate', (tradeId, status, targetPlayerId) => {
        const targetSocketId = playerSockets[targetPlayerId];
        if(targetSocketId) {
            io.to(targetSocketId).emit('tradeUpdate', { tradeId, status });
        }
    });

     socket.on('itemUpdate', () => {
        io.emit('itemDesignsUpdated');
        console.log("📢 Broadcating item design update to all clients.");
    });


    // --- טיפול בהתנתקות ---
    socket.on('disconnect', async () => {
        delete playerSockets[playerId];
        if (areaPlayers[areaId] && areaPlayers[areaId][playerId]) {
            console.log(`🔌 ${areaPlayers[areaId][playerId].username} disconnected.`);
            delete areaPlayers[areaId][playerId];
            io.to(areaId).emit('playerLeft', { playerId });
            
            // עדכון סטטוס ב-Base44
            try {
                await base44.entities.Player.update(playerId, { is_online: false });
            } catch(e) {
                console.error("Failed to update offline status for player:", playerId, e.message);
            }
        }
    });
});

// --- לולאת שידור מרכזית ---
setInterval(() => {
    for (const areaId in areaPlayers) {
        const playersInArea = Object.values(areaPlayers[areaId]);
        if (playersInArea.length > 0) {
            io.to(areaId).emit('playersUpdate', { players: playersInArea });
        }
    }
}, SYNC_INTERVAL);


// --- הפעלת השרת ---
httpServer.listen(PORT, () => {
    console.log(`
🚀 Touch World Server is live!
Listening on port: ${PORT}
`);
});
