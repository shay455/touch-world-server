// core/cors.js
const cors = require('cors');
const { allowedOrigins } = require('../config/config');

module.exports = cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    return allowedOrigins.includes(origin)
      ? cb(null, true)
      : cb(new Error('CORS blocked: ' + origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
});

