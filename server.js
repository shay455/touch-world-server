import { createServer } from 'http';
import { Server } from 'socket.io';

// --- הגדרות ---
const PORT = process.env.PORT || 3001;
const PLAYER_SYNC_INTERVAL = 50; // ms

// --- מערכת לוגים ---
const colors = { reset: '\x1b[0m', bright: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', magenta: '\x1b[35m', cyan: '\x1b[36m' };
const timestamp = () => new Date().toLocaleTimeString('he-IL', { hour12: false });
const Logger = {
    info: (msg, data = '') => console.log(`${colors.cyan}ℹ️  [${timestamp()}] [INFO]${colors.reset} ${msg}`, data),
    success: (msg, data = '') => console.log(`${colors.green}✅ [${timestamp()}] [SUCCESS]${colors.reset} ${msg}`, data),
    error: (msg, err = '') => console.error(`${colors.red}❌ [${timestamp()}] [ERROR]${colors.reset} ${msg}`, err),
    player: (action, data = '') => console.log(`${colors.magenta}👤 [${timestamp()}] [PLAYER]${colors.reset} ${action}`, data),
    chat: (user, msg, area) => console.log(`${colors.cyan}💬 [${timestamp()}] [CHAT]${colors.reset} ${colors.bright}${user}${colors.reset} (${area}): ${msg}`),
    connection: (action, data = '') => console.log(`${colors.green}🔌 [${timestamp()}] [CONNECT]${colors.reset} ${action}`, data),
};

// --- ניהול מצב המשחק ---
const players = new Map();

// --- הגדרות CORS ---
const allowedOrigins = [ 'http://localhost:5173', 'https://base44.app', /^https:\/\/.*\.base44\.app$/ ];
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.some(allowed => (typeof allowed === 'string' ? allowed === origin : allowed.test(origin)))) {
            callback(null, true);
        } else {
            Logger.error('CORS Error', `Origin ${origin} not allowed`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
};

// --- יצירת שרת ---
const httpServer = createServer((req, res) => {
    if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', players: players.size }));
    } else {
        res.writeHead(404);
        res.end();
    }
});

const io = new Server(httpServer, { cors: corsOptions });

// --- לוגיקת Socket.IO ---
io.on('connection', (socket) => {
    Logger.connection('New connection', { socketId: socket.id });

    socket.on('playerState', (state) => {
        if (!state || !state.id) return;
        
        const existingPlayer = players.get(state.id);
        
        if (!existingPlayer) { // שחקן חדש נכנס
            Logger.player('JOIN', { user: state.username, area: state.current_area });
            socket.join(state.current_area);
        } else if (existingPlayer.current_area !== state.current_area) { // שחקן מחליף אזור
            Logger.player('AREA CHANGE', { user: state.username, from: existingPlayer.current_area, to: state.current_area });
            socket.leave(existingPlayer.current_area);
            io.to(existingPlayer.current_area).emit('playerLeft', { playerId: state.id });
            socket.join(state.current_area);
        }
        
        players.set(state.id, { ...state, socketId: socket.id });
    });

    socket.on('bubbleMessage', (data) => {
        const player = [...players.values()].find(p => p.socketId === socket.id);
        if (player && player.current_area) {
            Logger.chat(data.username, data.message, player.current_area);
            io.to(player.current_area).emit('bubbleMessage', data);
        }
    });

    socket.on('disconnect', () => {
        Logger.connection('Disconnect', { socketId: socket.id });
        for (const [playerId, player] of players.entries()) {
            if (player.socketId === socket.id) {
                players.delete(playerId);
                io.emit('playerLeft', { playerId }); // שולח לכולם שהשחקן עזב
                Logger.player('LEAVE', { user: player.username });
                break;
            }
        }
    });
});

// --- לולאת סנכרון ---
setInterval(() => {
    const areasToUpdate = new Set([...players.values()].map(p => p.current_area));
    
    for (const areaId of areasToUpdate) {
        if (!areaId) continue;
        const playersInArea = [...players.values()].filter(p => p.current_area === areaId);
        io.to(areaId).emit('playersUpdate', { players: playersInArea });
    }
}, PLAYER_SYNC_INTERVAL);

// --- הרצת השרת ---
httpServer.listen(PORT, () => {
    Logger.success(`🚀 Touch World Server is live on port ${PORT}`);
});
