const fs = require('fs');
const path = require('path');
const winston = require('winston');
const { env } = require('../config/env');

const logsDir = path.resolve(process.cwd(), 'logs');
fs.mkdirSync(logsDir, { recursive: true });

const REDACTED_KEYS = ['authorization', 'token', 'password', 'jwt', 'cookie', 'db_password', 'redis_url'];

const sanitizeValue = (value, key = '') => {
  if (value === null || value === undefined) return value;

  const lowerKey = String(key).toLowerCase();
  if (REDACTED_KEYS.some((entry) => lowerKey.includes(entry))) {
    return '[REDACTED]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [
        nestedKey,
        sanitizeValue(nestedValue, nestedKey),
      ]),
    );
  }

  if (typeof value === 'string' && lowerKey.includes('url') && value.includes('@')) {
    return value.replace(/\/\/.*@/, '//[REDACTED]@');
  }

  return value;
};

const enrichInfo = winston.format((info) => {
  for (const [key, value] of Object.entries(info)) {
    info[key] = sanitizeValue(value, key);
  }

  info.service = 'showdown-server';
  info.env = env.NODE_ENV;

  return info;
});

const consoleFormat = winston.format.printf((info) => {
  if (info.boundary) {
    return `\n${info.message}\n`;
  }

  const { level, message, ...meta } = info;
  const extraMeta = { ...meta };

  delete extraMeta.service;
  delete extraMeta.env;

  const metaString = Object.keys(extraMeta).length ? ` ${JSON.stringify(extraMeta)}` : '';
  return `${level}: ${message}${metaString}`;
});

const fileFormat = winston.format.printf((info) => {
  if (info.boundary) {
    return `\n${info.timestamp} ${info.level}: boundary\n${info.message}\n`;
  }

  const { timestamp, level, message, stack, ...meta } = info;
  const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const stackString = stack ? `\n${stack}` : '';
  return `${timestamp} ${level}: ${message}${metaString}${stackString}`;
});

const createBoundaryBanner = (title, details = {}) => {
  const line = '='.repeat(60);
  const titleLine = `${'='.repeat(21)} ${title} ${'='.repeat(21)}`;
  const detailLines = Object.entries(details).map(([key, value]) => `${key}: ${value}`);

  return [line, titleLine, ...detailLines, line].join('\n');
};

const consoleFilter = winston.format((info) => {
  if (info.message === 'HTTP request started' || info.message === 'HTTP request completed') {
    return false;
  }

  return info;
});

const retainedFiles = env.NODE_ENV === 'production' ? 14 : 7;
const maxFileSize = 10 * 1024 * 1024;

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      consoleFilter(),
      consoleFormat,
    ),
  }),
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    maxsize: maxFileSize,
    maxFiles: retainedFiles,
    tailable: true,
    format: fileFormat,
  }),
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    maxsize: maxFileSize,
    maxFiles: retainedFiles,
    tailable: true,
    format: fileFormat,
  }),
];

const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    enrichInfo(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
  ),
  transports,
});

const withContext = (context = {}) => logger.child(sanitizeValue(context));

logger.withContext = withContext;
logger.sanitizeValue = sanitizeValue;
logger.createBoundaryBanner = createBoundaryBanner;
logger.boundary = (title, details = {}, level = 'info') => {
  logger.log({
    level,
    message: createBoundaryBanner(title, details),
    boundary: true,
  });
};

module.exports = logger;
