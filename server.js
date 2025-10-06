import { createServer } from 'http';
import { Server } from 'socket.io';

const httpServer = createServer();

// --- הגדרות CORS ---
// אלו הכתובות שמורשות להתחבר לשרת שלך
const allowedOrigins = [
    'http://localhost:5173', // לפיתוח מקומי
    'https://copy-565f73e8.base44.app', // כתובת האפליקציה הראשית
    'https://preview--copy-565f73e8.base44.app' // כתובת התצוגה המקדימה
];

const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            // מאפשר חיבורים ללא 'origin' (למשל, אפליקציות מובייל או Postman)
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) === -1) {
                const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
                return callback(new Error(msg), false);
            }
            return callback(null, true);
        },
        methods: ["GET", "POST"],
        credentials: true
    }
});

// --- ניהול מצב המשחק ---
const areaPlayers = {}; // אובייקט שיחזיק את כל השחקנים בכל אזור
const playerSockets = {}; // מפה של playerId ל-socket.id שלו

const SYNC_INTERVAL = 45; // עדכון מצב כל 45ms (כ-22 פריימים לשנייה)

io.on('connection', (socket) => {
    const playerId = socket.handshake.query.playerId;
    const areaId = socket.handshake.query.areaId;

    if (!playerId || !areaId) {
        console.error('❌ Connection rejected: Missing playerId or areaId');
        return socket.disconnect();
    }

    console.log(`✅ Player connected: ${playerId} in area: ${areaId} | Socket ID: ${socket.id}`);
    playerSockets[playerId] = socket.id;

    // --- הצטרפות לאזור ---
    socket.join(areaId);

    if (!areaPlayers[areaId]) {
        areaPlayers[areaId] = {};
    }

    // הוספת השחקן החדש עם מידע בסיסי, אם לא קיים
    if (!areaPlayers[areaId][playerId]) {
         areaPlayers[areaId][playerId] = { id: playerId, x: 960, y: 540, direction: 'front' };
    }
    
    // --- טיפול באירועים מהלקוח ---
    socket.on('playerState', (state) => {
        // עדכון שקט של מצב השחקן. השידור יתבצע בלולאת העדכון המרכזית
        if (areaPlayers[areaId] && areaPlayers[areaId][playerId]) {
            Object.assign(areaPlayers[areaId][playerId], state);
        }
    });

    socket.on('bubbleMessage', (data) => {
        // שדר הודעת בועה לכל השחקנים באותו אזור, חוץ מהשולח
        socket.to(areaId).emit('bubbleMessage', {
            playerId: data.playerId,
            message: data.message,
        });
    });

    socket.on('tradeRequest', (tradeId, initiatorId, receiverId) => {
        const receiverSocketId = playerSockets[receiverId];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('tradeRequest', { tradeId, initiatorId, receiverId });
            console.log(`Trade request from ${initiatorId} to ${receiverId} forwarded.`);
        }
    });
    
    socket.on('tradeUpdate', (tradeId, status, targetPlayerId) => {
        const targetSocketId = playerSockets[targetPlayerId];
        if(targetSocketId) {
            io.to(targetSocketId).emit('tradeUpdate', { tradeId, status });
        }
    });

     socket.on('itemUpdate', () => {
        // שדר לכל הלקוחות אירוע שיגרום להם לרענן את ה-cache
        io.emit('itemDesignsUpdated');
        console.log("📢 Broadcating item design update to all clients.");
    });


    // --- טיפול בהתנתקות ---
    socket.on('disconnect', () => {
        console.log(`🔌 Player disconnected: ${playerId}`);
        delete playerSockets[playerId];
        if (areaPlayers[areaId] && areaPlayers[areaId][playerId]) {
            delete areaPlayers[areaId][playerId];
            // הודע לכל השחקנים באזור שהשחקן עזב
            io.to(areaId).emit('playerLeft', { playerId });
        }
    });
});

// --- לולאת שידור מרכזית ---
setInterval(() => {
    for (const areaId in areaPlayers) {
        const playersInArea = areaPlayers[areaId];
        if (Object.keys(playersInArea).length > 0) {
            io.to(areaId).emit('playersUpdate', { players: Object.values(playersInArea) });
        }
    }
}, SYNC_INTERVAL);


// --- הפעלת השרת ---
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
