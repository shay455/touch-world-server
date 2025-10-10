// core/cors.js
function buildCorsMiddleware(cors, allowedOrigins) {
  return cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // אפשר כלי בדיקות / מובייל
      return allowedOrigins.includes(origin)
        ? cb(null, true)
        : cb(new Error('CORS blocked: ' + origin));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
  });
}

module.exports = { buildCorsMiddleware };
