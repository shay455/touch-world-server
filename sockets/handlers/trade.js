// sockets/handlers/trade.js
module.exports = (io, socket) => {
  socket.on('trade_request', (data = {}) => {
    const { tradeId, initiatorId, receiverId } = data;
    if (receiverId) {
      io.to(receiverId).emit('trade_request_received', data);
    }
  });

  socket.on('trade_update', (data = {}) => {
    const { tradeId, status, tradeDetails } = data;
    if (tradeDetails) {
      const otherId =
        socket.id === tradeDetails.initiator_id
          ? tradeDetails.receiver_id
          : tradeDetails.initiator_id;
      if (otherId) io.to(otherId).emit('trade_status_updated', data);
    }
  });
};

