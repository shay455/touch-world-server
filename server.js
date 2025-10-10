const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// הגדרת כתובות מורשות להתחבר לשרת
const allowedOrigins = [
  "https://touch-world.io/", // הדומיין הרשמי של המשחק
  "http://localhost:5173/", // כתובת לפיתוח מקומי
  "http://localhost:8081/"
];

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // מאפשר חיבורים ללא 'origin' (כמו אפליקציות מובייל או בדיקות)
      if (!origin) return callback(null, true);
      // בודק אם הכתובת המנסה להתחבר נמצאת ברשימת המורשים
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    methods: ["GET", "POST"]
  }
});

// אובייקט פשוט לשמירת רשימת השחקנים המחוברים בזיכרון השרת
const players = {};

// נתיב לבדיקת תקינות השרת (Health Check)
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Touch World Realtime Server is running.',
    connected_players_count: Object.keys(players).length,
    connected_players_ids: Object.keys(players)
  });
});

// לוגיקת ה-Socket.IO המרכזית
io.on('connection', (socket) => {
  console.log([+] Player connected: ${socket.id});

  // יצירת אובייקט שחקן חדש עם מיקום התחלתי
  players[socket.id] = {
    id: socket.id,
    position_x: 600, // מיקום ברירת מחדל
    position_y: 400,
    direction: 'front',
    animation_frame: 'idle',
    is_moving: false,
    // פרטים נוספים כמו שם משתמש, צבע וכו' יגיעו מהלקוח
  };

  // 1. שלח לשחקן החדש את רשימת כל השחקנים שכבר מחוברים
  socket.emit('current_players', players);

  // 2. אירוע "player_joined": שלח לכל השאר את פרטי השחקן החדש
  socket.broadcast.emit('player_joined', players[socket.id]);

  // 3. אירוע "player_move": קבלת עדכון מיקום משחקן ושידורו לכל השאר
  socket.on('player_move', (movementData) => {
    if (players[socket.id]) {
      // עדכון המידע על השחקן בשרת
      players[socket.id] = { ...players[socket.id], ...movementData };
      // שידור המידע המעודכן לכל השחקנים האחרים
      socket.broadcast.emit('player_moved', players[socket.id]);
    }
  });

  // 4. אירוע "chat_message": קבלת הודעת צ'אט ושידורה לכולם
  socket.on('chat_message', (chatData) => {
    // הוספת מזהה השחקן וזמן לנתוני הצ'אט
    const messagePayload = {
      playerId: socket.id,
      message: chatData.message,
      username: chatData.username,
      adminLevel: chatData.adminLevel,
      timestamp: Date.now()
    };
    // שידור ההודעה לכל השחקנים המחוברים (כולל השולח)
    io.emit('new_chat_message', messagePayload);
  });

  // 5. אירוע "disconnect": טיפול בהתנתקות שחקן
  socket.on('disconnect', () => {
    console.log([-] Player disconnected: ${socket.id});
    // הסרת השחקן מרשימת המחוברים
    delete players[socket.id];
    // אירוע "player_disconnected": הודעה לכל השאר שהשחקן התנתק
    io.emit('player_disconnected', socket.id);
  });
});

// הגדרת הפורט שעליו השרת יאזין
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(Touch World server listening on port ${PORT});
});
