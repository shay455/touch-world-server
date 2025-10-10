import { Server } from "npm:socket.io@4.7.5";
import { cors } from "npm:hono@4.2.5/cors";

const players = {};

// CORS middleware setup for standard HTTP requests
const corsMiddleware = cors({
  origin: ["https://touch-world.io", "http://localhost:5173", "http://localhost:8081"],
  allowHeaders: ['X-Custom-Header', 'Upgrade-Insecure-Requests'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  credentials: true,
});

const io = new Server({
    cors: {
        origin: ["https://touch-world.io", "http://localhost:5173", "http://localhost:8081"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

io.on("connection", (socket) => {
    console.log(`[+] A user connected: ${socket.id}`);

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
        console.log(`[CHAT] ${chatData.username}: ${chatData.message}`);
        io.emit("new_chat_message", {
            playerId: socket.id,
            message: chatData.message,
            username: chatData.username,
            adminLevel: chatData.adminLevel,
            timestamp: Date.now()
        });
    });

    socket.on("trade_request", (data) => {
        console.log(`[TRADE] Request from ${data.initiatorId} to ${data.receiverId}`);
        io.to(data.receiverId).emit("trade_request_received", data);
    });

    socket.on("trade_update", (data) => {
        console.log(`[TRADE] Update for trade ${data.tradeId}, status: ${data.status}`);
        const trade = data.tradeDetails;
        if (trade) {
            const otherPlayerId = socket.id === trade.initiator_id ? trade.receiver_id : trade.initiator_id;
            io.to(otherPlayerId).emit("trade_status_updated", data);
        }
    });

    socket.on("disconnect", () => {
        console.log(`[-] User disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit("player_disconnected", socket.id);
    });
});

// The main HTTP handler
async function handler(req) {
    // Handle CORS preflight requests for standard HTTP endpoints
    if (req.method === 'OPTIONS') {
        const request = new Request(req.url, { headers: req.headers });
        return await corsMiddleware(request, async () => new Response(null, { status: 204 }))
    }
    
    // Check if the request is for the health check endpoint
    const url = new URL(req.url);
    if (url.pathname === '/') {
         return new Response(
            JSON.stringify({
                status: 'ok',
                message: 'Touch World Realtime Server is running.',
                connected_players: Object.keys(players).length
            }),
            { headers: { "Content-Type": "application/json" } }
        );
    }
    
    // Upgrade the request to a WebSocket connection for Socket.IO
    return io.handler(req);
}

// Deno.serve is the entry point for Base44 functions
Deno.serve(handler);
