// config/config.js
const allowedOrigins = [
  'https://touch-world-server.onrender.com',
  'https://touch-world.io',
  'http://localhost:5173',
  'http://localhost:8081'
];

module.exports = {
  PORT: process.env.PORT || 8080,
  SOCKET_PATH: '/socket.io',
  allowedOrigins
};

