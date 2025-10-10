import { Server } from "npm:socket.io@4.7.5";

const players = {};

// הגדרת כתובות מורשות להתחבר לשרת
const allowedOrigins = [
  "https://touch-world.io/", // הדומיין הרשמי של המשחק (לסביבת Production)
  "http://localhost:5173/", // כתובת לפיתוח מקומי
  "http://localhost:8081/"  // כתובת נוספת לפיתוח
];

const io = new Server({
    path: "/socket.io", // הגדרה מפורשת של הנתיב
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    },
    // מאפשר ל-Socket.IO לעבוד עם long-polling כגיבוי
    transports: ['websocket', 'polling'], 
});

io.on("connection", (socket) => {
    console.log([+] A user connected: ${socket.id});

    players[socket.id] = {
        id: socket.id,
        position_x: 600,
        position_y: 400,
        direction: 'front',
        animation_frame: 'idle',
        is_moving: false,
    };

    socket.emit("current_players", players);
    socket.broadcast.emit("player_joined", players[socket.id]);

    socket.on("player_update", (playerData) => {
        if (players[socket.id]) {
            players[socket.id] = { ...players[socket.id], ...playerData };
            socket.broadcast.emit("player_moved", players[socket.id]);
        }
    });

    socket.on("chat_message", (chatData) => {
        console.log([CHAT] ${chatData.username}: ${chatData.message});
        io.emit("new_chat_message", {
            playerId: socket.id,
            message: chatData.message,
            username: chatData.username,
            adminLevel: chatData.adminLevel,
            timestamp: Date.now()
        });
    });

    socket.on("trade_request", (data) => {
        console.log([TRADE] Request from ${data.initiatorId} to ${data.receiverId});
        io.to(data.receiverId).emit("trade_request_received", data);
    });

    socket.on("trade_update", (data) => {
        console.log([TRADE] Update for trade ${data.tradeId}, status: ${data.status});
        const trade = data.tradeDetails;
        if (trade) {
            const otherPlayerId = socket.id === trade.initiator_id ? trade.receiver_id : trade.initiator_id;
            io.to(otherPlayerId).emit("trade_status_updated", data);
        }
    });

    socket.on("disconnect", () => {
        console.log([-] User disconnected: ${socket.id});
        delete players[socket.id];
        io.emit("player_disconnected", socket.id);
    });
});

// The main HTTP handler for the Deno function
function handler(req) {
    const url = new URL(req.url);

    // Health check endpoint
    if (url.pathname.endsWith('/server') && req.method === 'GET') {
         return new Response(
            JSON.stringify({
                status: 'ok',
                message: 'Touch World Realtime Server is running.',
                connected_players: Object.keys(players).length
            }),
            { 
                status: 200,
                headers: { "Content-Type": "application/json" }
            }
        );
    }

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        const origin = req.headers.get("Origin");
        if (origin && allowedOrigins.includes(origin)) {
             return new Response(null, {
                status: 204, // No Content
                headers: {
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                    'Access-Control-Allow-Credentials': 'true',
                },
            });
        }
       return new Response(null, { status: 204 });
    }

    // Pass other requests to Socket.IO handler
    return io.handler(req);
}

// Deno.serve is the entry point for Base44 functions
Deno.serve(handler);
