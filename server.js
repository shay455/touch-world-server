import 'dotenv/config';
import { WebSocketServer } from 'ws';
import { createClient } from '@base44/sdk';
import express from 'express';
import http from 'http';
import cors from 'cors';

const PORT = process.env.PORT || 3000;

// --- הגדרות שרת Express ---
const app = express();
app.use(cors());
app.use(express.json());

// נקודת קצה לבדיקת תקינות
app.get('/', (req, res) => {
    res.status(200).json({ message: 'Touch World Realtime Server is running!' });
});

const server = http.createServer(app);

// --- התחברות ל-Base44 ---
const BASE44_URL = process.env.BASE44_URL;
const BASE44_SERVICE_KEY = process.env.BASE44_SERVICE_KEY;

if (!BASE44_URL || !BASE44_SERVICE_KEY) {
    console.error('FATAL ERROR: Missing BASE44_URL or BASE44_SERVICE_KEY environment variables.');
    process.exit(1);
}

const base44 = createClient(BASE44_URL, BASE44_SERVICE_KEY);
console.log('Successfully connected to Base44 services.');

// --- הגדרות שרת WebSocket ---
const wss = new WebSocketServer({ server });

const clients = new Map(); // מאחסן את כל החיבורים הפעילים

wss.on('connection', (ws, req) => {
    // קבלת פרמטרים מהחיבור
    const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const playerId = urlParams.get('playerId');
    const areaId = urlParams.get('areaId');
    const sessionId = urlParams.get('sessionId');

    if (!playerId || !areaId || !sessionId) {
        console.warn('Connection rejected: Missing parameters');
        ws.close(1008, 'Invalid connection parameters');
        return;
    }

    console.log(`[Connect] Player ${playerId} connected to area ${areaId}`);
    clients.set(playerId, { ws, areaId, sessionId });

    // טיפול בהודעות נכנסות (אם יהיו בעתיד)
    ws.on('message', (message) => {
        console.log(`Received message from ${playerId}: ${message}`);
    });

    // טיפול בסגירת חיבור
    ws.on('close', async () => {
        console.log(`[Disconnect] Player ${playerId} disconnected.`);
        clients.delete(playerId);
        try {
            // עדכון סטטוס השחקן ב-DB ל"לא מחובר"
            await base44.entities.Player.update(playerId, { is_online: false });
            console.log(`[DB Update] Set player ${playerId} to offline.`);
        } catch (error) {
            console.error(`[DB Error] Failed to update player ${playerId}:`, error.message);
        }
    });

    ws.on('error', (error) => {
        console.error(`[WebSocket Error] Player ${playerId}:`, error);
    });
});

// --- הפעלת השרת ---
server.listen(PORT, () => {
    console.log(`🚀 Touch World Realtime Server listening on port ${PORT}`);
});
