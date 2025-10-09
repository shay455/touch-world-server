export default class GameManager {
    constructor(io) {
        this.io = io;
        // Storing rooms (areas) and players within them
        // Format: { "areaId": { players: { "playerId": { ...playerData } } } }
        this.areas = {};
        // Map socket IDs to their respective area and player ID for quick lookups
        this.socketToPlayerMap = new Map();
    }

    addPlayerToArea(socket, playerId, areaId) {
        // If the area doesn't exist, create it
        if (!this.areas[areaId]) {
            this.areas[areaId] = { players: {} };
        }

        // Add the player to the area's player list
        this.areas[areaId].players[playerId] = {
            id: playerId,
            position_x: 600, // Default start position
            position_y: 400,
            direction: 'front',
            animation_frame: 'idle',
            // ... other initial state ...
        };

        // Have the socket join the corresponding Socket.IO room
        socket.join(areaId);
        this.socketToPlayerMap.set(socket.id, { playerId, areaId });

        // Notify other players in the area about the new player
        this.broadcastAreaState(areaId);
    }

    removePlayerFromArea(socket) {
        const playerInfo = this.socketToPlayerMap.get(socket.id);
        if (!playerInfo) return;

        const { playerId, areaId } = playerInfo;

        if (this.areas[areaId] && this.areas[areaId].players[playerId]) {
            // Remove player from the area
            delete this.areas[areaId].players[playerId];
            console.log(`Player ${playerId} removed from area ${areaId}`);

            // Remove the socket mapping
            this.socketToPlayerMap.delete(socket.id);

            // Notify remaining players that this player has left
            this.io.to(areaId).emit('playerLeft', { playerId });

            // If the area is now empty, we can clean it up (optional)
            if (Object.keys(this.areas[areaId].players).length === 0) {
                delete this.areas[areaId];
                console.log(`Area ${areaId} is now empty and has been cleaned up.`);
            }
        }
    }

    updatePlayerState(areaId, playerState) {
        if (this.areas[areaId] && this.areas[areaId].players[playerState.id]) {
            // Merge new state into the existing player state
            Object.assign(this.areas[areaId].players[playerState.id], playerState);
            // Broadcast the updated state of all players in the area
            this.broadcastAreaState(areaId);
        }
    }

    broadcastAreaState(areaId) {
        if (this.areas[areaId]) {
            const playersInArea = Object.values(this.areas[areaId].players);
            this.io.to(areaId).emit('playersUpdate', { players: playersInArea });
        }
    }

    getPlayerArea(socketId) {
        return this.socketToPlayerMap.get(socketId)?.areaId;
    }
    
    getPlayerIdBySocketId(socketId) {
        return this.socketToPlayerMap.get(socketId)?.playerId;
    }
}
