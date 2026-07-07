const { env } = require('./env');
const logger = require('../utils/logger');

// Origins permitted when no explicit ALLOWED_ORIGINS is set in env.
// Client (Next.js) runs on port 5003; venue/host/admin are all served from the same client.
const DEFAULT_DEV_ORIGINS = ['http://localhost:5003', 'http://127.0.0.1:5003'];

const DEFAULT_PROD_ORIGINS = [
  'https://showdown-frontend.24livehost.com',
  'https://showdown-backend.24livehost.com',
  'https://showdowntrivia.24livehost.com',
  'https://showdowntrivia-web.24livehost.com',
];

const normalizeOrigin = (value) => String(value || '').trim().replace(/\/$/, '');

const parseAllowedOrigins = (raw) => {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);
};

const getAllowedOrigins = () => {
  const fromEnv = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  if (fromEnv.length > 0) return fromEnv;
  return env.NODE_ENV === 'production' ? DEFAULT_PROD_ORIGINS : DEFAULT_DEV_ORIGINS;
};

// Fastify-style origin validator. Browser requests carry an Origin header;
// non-browser callers (curl, server-to-server, health checks) do not, so we let those through.
const buildOriginValidator = (allowed) => (origin, cb) => {
  if (!origin) return cb(null, true);
  const normalized = normalizeOrigin(origin);
  if (allowed.includes(normalized)) return cb(null, normalized);
  logger.warn('CORS origin rejected', { origin: normalized, allowed });
  return cb(new Error(`CORS: origin "${normalized}" not allowed`), false);
};

const getCorsOptions = () => {
  const allowed = getAllowedOrigins();
  logger.info('CORS configured', { env: env.NODE_ENV, allowed });
  return {
    origin: buildOriginValidator(allowed),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
  };
};

// Socket.io expects an array/string/regex for `origin`, not a Fastify-style callback.
const getSocketCorsOptions = () => {
  const allowed = getAllowedOrigins();
  return {
    origin: allowed,
    methods: ['GET', 'POST'],
    credentials: true,
  };
};

module.exports = {
  getAllowedOrigins,
  getCorsOptions,
  getSocketCorsOptions,
};
