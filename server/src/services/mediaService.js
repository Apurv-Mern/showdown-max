const storage = require('./storage');
const { env } = require('../config/env');
const logger = require('../utils/logger');

const ALLOWED_TYPES = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'video/mp4': 'mp4',
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

/**
 * Save an uploaded file to the configured storage backend.
 * @param {object} file - Multipart file object from Fastify
 * @returns {Promise<{ filename: string, url: string, mediaType: string }>}
 */
const saveFile = async (file) => {
  const ext = ALLOWED_TYPES[file.mimetype];
  if (!ext) {
    throw Object.assign(
      new Error(`Unsupported file type: ${file.mimetype}. Allowed: MP3, MP4, JPEG, PNG, GIF, WebP`),
      { statusCode: 400 },
    );
  }

  const buffer = await file.toBuffer();

  if (buffer.length > MAX_FILE_SIZE) {
    throw Object.assign(
      new Error(`File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`),
      { statusCode: 400 },
    );
  }

  const timestamp = Date.now();
  const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = `${timestamp}_${safeName}`;

  const result = await storage.saveFile({
    filename,
    buffer,
    contentType: file.mimetype,
  });

  logger.info('File uploaded', { filename, size: buffer.length, type: ext, backend: env.STORAGE_BACKEND });

  return {
    filename: result.filename,
    url: result.url,
    mediaType: ext,
  };
};

/** @deprecated Use fileExists / getFileStream. Local storage only. */
const getFilePath = (filename) => {
  if (env.STORAGE_BACKEND !== 'local') return null;
  return require('./storage/localStorage').getFilePath(filename);
};

const fileExists = async (filename) => storage.fileExists(filename);

const getFileStream = async (filename) => storage.getFileStream(filename);

const getPublicUrl = (filename) => {
  if (typeof storage.getPublicUrl === 'function') {
    return storage.getPublicUrl(filename);
  }
  return null;
};

const deleteFile = async (filename) => storage.deleteFile(filename);

const listFiles = async () => storage.listFiles();

module.exports = {
  saveFile,
  getFilePath,
  fileExists,
  getFileStream,
  getPublicUrl,
  deleteFile,
  listFiles,
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
};
