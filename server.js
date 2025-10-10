// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

// ─────────────────────────────────────────────────────────────────────────────
// App & HTTP server
// ─────────────────────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Allowed origins (without trailing slashes!)
 * אפשר גם לספק דרך ENV: CORS_ORIGINS="https://touch-world.io,https://play.touch-world.io"
 */
const envOrigins =
  process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()) || [];

const defaultAllowedOrigins = [
  "https://touch-world.io",       // הדומיין הרשמי של המשחק
  "https://play.touch-world.io",  // אם יש סאב-דומיין לקליינט
  "http://localhost:5173",        // Vite dev
  "http://localhost:8081",        // אפשרות dev נוספת
  "http://localhost:3000",        // אופציית dev נפוצה
];

const allowedOrigins = [...new Set([...defaultAllowedOrigins, ...envOrigins])];

// פונקציית נרמול כדי להסיר סלאש סופי אם הופיע
const normalizeOrigin = (origin) =>
  origin ? origin.replace(/\/+$/, "") : origin;

// ─────────────────────────────────────────────────────────────────────────────
// CORS for REST (ה-Socket.IO מקבל CORS משלו למטה)
// ─────────────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // מאפשר בקשות בלי Origin (כמו curl/בדיקות/אפליקציות Native)
      const normalized = normalizeOrigin(origin);
      if (allowedOrigins.includes(normalized)) return callback(null, true);
      return callback(
        new Error(
          "CORS: The specified Origin is not allowed: " + normalized
        ),
        false
      );
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO
// ─────────────────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalized = normalizeOrigin(origin);
      if (allowedOrigins.includes(normalized)) return callback(null, true);
      return callback(
        new Error(
          "Socket.IO CORS: The specified Origin is not allowed: " + normalized
        ),
        false
      );
    },
    methods: ["GET", "POST"],
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// In-memory players map (בפרודקשן מומלץ Redis/DB לשיתוף בין אינסטנסים)
// ─────────────────────────────────────────────────────────────────────────────
const players = {};

// ─────────────────────────────────────────────────────────────────────────────
// Health Check & Debug routes
// ─────────────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Touch World Realtime Server is running.",
    connected_players_count: Object.keys(players).length,
    connected_players_ids: Object.keys(players),
    allowed_origins: allowedOrigins,
    uptime_seconds: process.uptime(),
  });
});

app.get("/healthz", (req, res) => res.status(204).send());

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO logic
// ─────────────────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  // יצירת אובייקט שחקן חדש עם מיקום התחלתי
  players[socket.id] = {
    id: socket.id,
    position_x: 600, // מיקום ברירת מחדל
    position_y: 400,
    direction: "front",
    animation_frame: "idle",
    is_moving: false,
    // פרטים נוספים (username, adminLevel וכו') יגיעו מהקליינט
  };

  // 1) שלח לשחקן החדש את המצב הנוכחי
  socket.emit("current_players", players);

  // 2) עדכן את שאר השחקנים על חיבור חדש
  socket.broadcast.emit("player_joined", players[socket.id]);

  // 3) תנועה — קבל עדכון ושדר לשאר
  socket.on("player_move", (movementData = {}) => {
    if (!players[socket.id]) return;
    players[socket.id] = { ...players[socket.id], ...movementData };
    socket.broadcast.emit("player_moved", players[socket.id]);
  });

  // 4) צ'אט — קבל ושדר לכולם
  socket.on("chat_message", (chatData = {}) => {
    const messagePayload = {
      playerId: socket.id,
      message: String(chatData.message ?? "").slice(0, 300), // הגבלת אורך בסיסית
      username: chatData.username ?? null,
      adminLevel: chatData.adminLevel ?? 0,
      timestamp: Date.now(),
    };
    io.emit("new_chat_message", messagePayload);
  });

  // 5) ניתוק
  socket.on("disconnect", () => {
    console.log(`[-] Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit("player_disconnected", socket.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Start server (Render מספק PORT ב-ENV)
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`[✓] Touch World server listening on port ${PORT}`);
});
