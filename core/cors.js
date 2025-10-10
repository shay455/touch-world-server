const cors = require('cors');
const { ALLOWED_ORIGINS } = require('../config/config');

module.exports = cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    return ALLOWED_ORIGINS.includes(origin)
      ? cb(null, true)
      : cb(new Error('CORS blocked: ' + origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
});
