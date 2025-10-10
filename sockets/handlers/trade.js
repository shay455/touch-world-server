// sockets/handlers/trade.js
module.exports = function registerTradeHandlers(io, socket) {
  socket.on('trade_request', (data = {}) => {
    const { tradeId, initiatorId, receiverId } = data;
    if (receiverId) {
      console.log(`[TRADE] Request ${tradeId} from ${initiatorId} to ${receiverId}`);
      io.to(receiverId).emit('trade_request_received', data);
    }
  });

  socket.on('trade_update', (data = {}) => {
    const { tradeId, status, tradeDetails } = data;
    console.log(`[TRADE] Update trade ${tradeId}, status: ${status}`);

    if (tradeDetails) {
      const otherPlayerId =
        socket.id === tradeDetails.initiator_id
          ? tradeDetails.receiver_id
          : tradeDetails.initiator_id;

      if (otherPlayerId) io.to(otherPlayerId).emit('trade_status_updated', data);
    }
  });
};
