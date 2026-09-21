/**
 * CORS middleware configuration.
 * Extracted from server.js -- restricted origin policy.
 */

const cors = require("cors");
const { getOAuthAllowedCorsOrigins } = require('../utils/oauthClients');
const { isOriginAllowed } = require('../utils/allowedOrigins');

const STATIC_ALLOWED_DOMAINS = [
    'localhost',
    'localhost:3000',
    'orvix.blog',
    'orvix.rodeo',
    'orvix.club',
    'orvix.site',
    'orvix11.pages.dev',
    'nakios.site',
    'cinezo.site',
    'cinezo.online',
    'filmib.cc',
    'orvix.llc',
    'orvix.cash',
    'orvix.tax',
    'orvix.cloud',
    'orvix.golf',
    'orvix.chat',
    'orvix.date',
    'orvix.show',
    'orvix.fun'
];

function isAllowedStaticOrigin(origin) {
  try {
    // Les domaines en dur + ceux de `ORVIX_ALLOWED_ORIGINS` (déploiement sur
    // un domaine propre sans toucher au code).
    return isOriginAllowed(origin, STATIC_ALLOWED_DOMAINS);
  } catch {
    return false;
  }
}

function isAllowedOAuthOrigin(origin) {
  return getOAuthAllowedCorsOrigins().includes(origin);
}

const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow all localhost, 127.0.0.1 and private LAN IPs (192.168.x, 10.x, 172.16-31.x) in development
    if (
      process.env.NODE_ENV !== 'production' &&
      origin.match(/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:[0-9]+)?$/)
    ) {
      return callback(null, true);
    }

    if (isAllowedStaticOrigin(origin) || isAllowedOAuthOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE", "PATCH", "HEAD"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "X-No-Compression",
    "Access-Control-Request-Headers",
    "baggage",
    "sentry-trace",
    "x-profile-id",
    "x-access-key",
    "x-orvix-client-id",
    "x-vip-token",
    "x-device-seed",
    "x-access-key-expires",
  ],
  credentials: true,
  optionsSuccessStatus: 204,
});

module.exports = corsMiddleware;
