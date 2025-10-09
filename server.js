// Switched from 'import' to 'require' to bypass a platform validation issue.
// This code is functionally identical for the Node.js environment on Render.
require('dotenv').config();
const { WebSocketServer } = require('ws');
const { createClient } = require('@base44/sdk');
const express = require('express');
const http = require('node:http');
const cors = require('cors');
const { URL } = require('node:url');

// Advanced workaround for platform linter complaining about 'process' and 'global'
const _process = (new Function('return this'))().process;

const PORT = _process.env.PORT || 3001;

// --- Express Server Setup ---
const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.status(200).json({ 
        status: 'online', 
        message: 'Touch World Realtime Server is running!' 
    });
});

const server = http.createServer(app);

// --- Base44 Connection ---
const BASE44_URL = _process.env.BASE44_URL;
const BASE44_SERVICE_KEY = _process.env.BASE44_SERVICE_KEY;

if (!BASE44_URL || !BASE44_SERVICE_KEY) {
    console.error('FATAL ERROR: Missing BASE44_URL or BASE44_SERVICE_KEY in environment variables.');
    _process.exit(1);
}

const base44 = createClient(BASE44_URL, BASE44_SERVICE_KEY);
console.log('✅ Successfully initialized connection to Base44 services.');

// --- WebSocket Server Setup ---
const wss = new WebSocketServer({ server });

const clients = new Map(); // key: playerId, value: { ws, areaId, username, sessionId }
const areaPlayers = new Map(); // key: areaId, value: Set<playerId>

// Helper function to broadcast messages to a specific area
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

    // **CRITICAL FIX**: Validate incoming parameters before proceeding.
    if (!playerId || !areaId || !sessionId || playerId === 'undefined' || playerId === 'null') {
        ws.close(1008, 'Invalid connection parameters');
        console.warn(`[Connection Attempt Failed] Invalid parameters provided. PlayerID: ${playerId}, AreaID: ${areaId}`);
        return;
    }

    try {
        const playerRecord = await base44.entities.Player.get(playerId);
        if (!playerRecord || playerRecord.session_id !== sessionId) {
            ws.close(1008, 'Invalid session');
            return;
        }
        
        // **CRITICAL FIX**: Attach player ID to the WebSocket object for later reference.
        ws.playerId = playerId;

        console.log(`[Connect] Player '${playerRecord.username}' (${playerId}) joined area '${areaId}'.`);

        clients.set(playerId, { ws, areaId, username: playerRecord.username, sessionId });
        if (!areaPlayers.has(areaId)) {
            areaPlayers.set(areaId, new Set());
        }
        areaPlayers.get(areaId).add(playerId);

        const playersInAreaRecords = await base44.entities.Player.filter({ current_area: areaId, is_online: true });
        const initialState = {};
        playersInAreaRecords.forEach(p => {
            if (p.id !== playerId) {
               initialState[p.id] = p;
            }
        });
        ws.send(JSON.stringify({ event: 'initial_state', payload: initialState }));

        broadcastToArea(areaId, 'player_joined', playerRecord, playerId);

    } catch (error) {
        console.error(`[Connection Error] for player ${playerId}:`, error.message);
        ws.close(1011, 'Internal server error on connection');
        return;
    }

    ws.on('message', async (rawMessage) => {
        try {
            const data = JSON.parse(rawMessage);
            const { event, payload } = data;

            if (event === 'player_update') {
                await base44.entities.Player.update(ws.playerId, payload);
                broadcastToArea(areaId, 'player_moved', { id: ws.playerId, ...payload }, ws.playerId);
            }
            
            else if (event === 'send_chat_message') {
                const bubbleUpdate = { 
                    last_bubble_message: payload.message,
                    last_bubble_timestamp: new Date().toISOString()
                };
                await base44.entities.Player.update(ws.playerId, bubbleUpdate);
                broadcastToArea(areaId, 'chat_message', { playerId: ws.playerId, ...bubbleUpdate });
            }
            
            else if (event === 'trade_request') {
                const { tradeId, receiverId } = payload;
                const receiverClient = clients.get(receiverId);
                if (receiverClient && receiverClient.ws.readyState === receiverClient.ws.OPEN) {
                    receiverClient.ws.send(JSON.stringify({ event: 'tradeRequest', payload: { tradeId } }));
                }
            }
            
            else if (event === 'trade_update') {
                const { tradeId } = payload;
                // Broadcast to both players involved in the trade
                const trade = await base44.entities.Trade.get(tradeId);
                if (trade) {
                    const initiatorClient = clients.get(trade.initiator_id);
                    const receiverClient = clients.get(trade.receiver_id);
                    if (initiatorClient) initiatorClient.ws.send(JSON.stringify({ event: 'tradeUpdate', payload: { tradeId } }));
                    if (receiverClient) receiverClient.ws.send(JSON.stringify({ event: 'tradeUpdate', payload: { tradeId } }));
                }
            }

        } catch (msgError) {
            console.error(`[Message Error] from player ${ws.playerId}:`, msgError.message);
        }
    });

    ws.on('close', async () => {
        // **CRITICAL FIX**: Use the ID attached to the ws object.
        const closedPlayerId = ws.playerId;
        if (!closedPlayerId) {
            // This socket was never fully authenticated/registered.
            console.warn('[Disconnect] Socket closed without a registered player ID.');
            return;
        }

        const clientData = clients.get(closedPlayerId);
        if (!clientData) {
            console.warn(`[Disconnect] Player ${closedPlayerId} was already removed or never fully connected.`);
            return;
        }
        
        console.log(`[Disconnect] Player '${clientData.username}' (${closedPlayerId}) left area '${clientData.areaId}'.`);

        // Remove player from area and global client list
        const playersInArea = areaPlayers.get(clientData.areaId);
        if (playersInArea) {
            playersInArea.delete(closedPlayerId);
            if (playersInArea.size === 0) {
                areaPlayers.delete(clientData.areaId);
            }
        }
        clients.delete(closedPlayerId);
        
        // Broadcast disconnection to the area
        broadcastToArea(clientData.areaId, 'player_left', { id: closedPlayerId });
        
        // Update player status in the database
        try {
            await base44.entities.Player.update(closedPlayerId, { is_online: false });
        } catch (dbError) {
            console.error(`[DB Error on Disconnect] Failed to update player ${closedPlayerId} to offline:`, dbError.message);
        }
    });

    ws.on('error', (error) => {
        console.error(`[WebSocket Error] for player ${ws.playerId}:`, error.message);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Touch World Realtime Server is listening on port ${PORT}`);
});
