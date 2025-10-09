import 'dotenv/config';
import { WebSocketServer } from 'ws';
import { createClient } from '@base44/sdk';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { URL } from 'url';

const PORT = process.env.PORT || 3001; // מומלץ להשתמש בפורט שונה מ-3000

// --- הגדרות שרת Express ---
const app = express();
app.use(cors());
app.use(express.json());

// נקודת קצה לבדיקת תקינות שהשרת רץ
app.get('/', (req, res) => {
    res.status(200).json({ 
        status: 'online', 
        message: 'Touch World Realtime Server is running!' 
    });
});

const server = http.createServer(app);

// --- התחברות ל-Base44 ---
const BASE44_URL = process.env.BASE44_URL;
const BASE44_SERVICE_KEY = process.env.BASE44_SERVICE_KEY;

if (!BASE44_URL || !BASE44_SERVICE_KEY) {
    console.error('FATAL ERROR: Missing BASE44_URL or BASE44_SERVICE_KEY in environment variables.');
    process.exit(1);
}

const base44 = createClient(BASE44_URL, BASE44_SERVICE_KEY);
console.log('✅ Successfully initialized connection to Base44 services.');

// --- הגדרות שרת WebSocket ---
const wss = new WebSocketServer({ server });

const clients = new Map(); // key: playerId, value: { ws, areaId, username }
const areaPlayers = new Map(); // key: areaId, value: Set<playerId>

// פונקציה לשליחת הודעה לכל השחקנים באזור מסוים
const broadcastToArea = (areaId, event, payload, excludePlayerId = null) => {
    const playersInArea = areaPlayers.get(areaId);
    if (!playersInArea) return;

    const message = JSON.stringify({ event, payload });

    playersInArea.forEach(playerId => {
        if (playerId !== excludePlayerId) {
            const client = clients.get(playerId);
            if (client && client.ws.readyState === client.ws.OPEN) {
                client.ws.send(message);
            }
        }
    });
};

wss.on('connection', async (ws, req) => {
    const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const playerId = urlParams.get('playerId');
    const areaId = urlParams.get('areaId');
    const sessionId = urlParams.get('sessionId');

    if (!playerId || !areaId || !sessionId) {
        ws.close(1008, 'Invalid connection parameters');
        return;
    }

    try {
        const playerRecord = await base44.entities.Player.get(playerId);
        // אימות שה-Session ID תואם למה ששמור ב-DB
        if (!playerRecord || playerRecord.session_id !== sessionId) {
            ws.close(1008, 'Invalid session');
            return;
        }

        console.log(`[Connect] Player '${playerRecord.username}' (${playerId}) joined area '${areaId}'.`);

        // שמירת פרטי הלקוח
        clients.set(playerId, { ws, areaId, username: playerRecord.username });
        if (!areaPlayers.has(areaId)) {
            areaPlayers.set(areaId, new Set());
        }
        areaPlayers.get(areaId).add(playerId);

        // 1. שלח לשחקן החדש את רשימת השחקנים שכבר נמצאים באזור
        const playersInAreaRecords = await base44.entities.Player.filter({ current_area: areaId, is_online: true });
        const initialState = {};
        playersInAreaRecords.forEach(p => {
            if (p.id !== playerId) { // אל תשלח לשחקן את עצמו
               initialState[p.id] = p;
            }
        });
        ws.send(JSON.stringify({ event: 'initial_state', payload: initialState }));

        // 2. הודע לכל השחקנים האחרים באזור על השחקן החדש שהצטרף
        broadcastToArea(areaId, 'player_joined', playerRecord, playerId);

        // טיפול בהודעות נכנסות מהלקוח
        ws.on('message', async (rawMessage) => {
            try {
                const data = JSON.parse(rawMessage);
                const { event, payload } = data;

                if (event === 'player_update') {
                    // עדכון המיקום/סטטוס של השחקן ב-DB
                    await base44.entities.Player.update(playerId, payload);
                    // שליחת העדכון לשאר השחקנים באזור
                    broadcastToArea(areaId, 'player_moved', { id: playerId, ...payload }, playerId);
                }
                
                 if (event === 'send_chat_message') {
                    // עדכון בועת הדיבור ב-DB ושליחה לכולם
                    const bubbleUpdate = { 
                        last_bubble_message: payload.message, 
                        last_bubble_timestamp: new Date().toISOString() 
                    };
                    await base44.entities.Player.update(playerId, bubbleUpdate);
                    broadcastToArea(areaId, 'chat_message', { playerId, username: playerRecord.username, ...bubbleUpdate });
                }

            } catch (error) {
                console.error(`[Message Error] from ${playerId}:`, error);
            }
        });

        // טיפול בסגירת החיבור
        ws.on('close', async () => {
            console.log(`[Disconnect] Player '${playerRecord.username}' (${playerId}) disconnected.`);
            clients.delete(playerId);
            const currentPlayersInArea = areaPlayers.get(areaId);
            if (currentPlayersInArea) {
                currentPlayersInArea.delete(playerId);
            }
            
            // עדכון ה-DB שהשחקן לא מחובר
            await base44.entities.Player.update(playerId, { is_online: false });

            // הודעה לשאר השחקנים באזור שהשחקן עזב
            broadcastToArea(areaId, 'player_left', { id: playerId });
        });

    } catch (error) {
        console.error(`[Connection Error] for player ${playerId}:`, error.message);
        ws.close(1011, 'Internal server error');
    }
});

// --- הפעלת השרת ---
server.listen(PORT, () => {
    console.log(`🚀 External Realtime Server for Touch World is listening on port ${PORT}`);
});
