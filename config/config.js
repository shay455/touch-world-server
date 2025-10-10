// הגדרות כלליות
module.exports = {
  PORT: process.env.PORT || 8080,
  // שים לב: בלי סלאש בסוף ה-Origin
  ALLOWED_ORIGINS: [
    'https://touch-world-server.onrender.com',
    'https://touch-world.io',
    'http://localhost:5173',
    'http://localhost:8081'
  ]
};
