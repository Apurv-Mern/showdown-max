const fs = require('fs');
const path = require('path');
const { env } = require('../config/env');
const logger = require('../utils/logger');

const ALLOWED_TYPES = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'video/mp4': 'mp4',
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

/**
 * Ensure the upload directory exists
 */
const ensureUploadDir = () => {
  const uploadPath = path.resolve(env.UPLOAD_DIR);
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }
  return uploadPath;
};

/**
 * Save an uploaded file to the uploads directory
 * @param {object} file - Multipart file object from Fastify
 * @returns {Promise<{ filename: string, url: string, mediaType: string }>}
 */
const saveFile = async (file) => {
  const uploadDir = ensureUploadDir();

  const ext = ALLOWED_TYPES[file.mimetype];
  if (!ext) {
    throw Object.assign(
      new Error(`Unsupported file type: ${file.mimetype}. Allowed: MP3, MP4`),
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
  const filepath = path.join(uploadDir, filename);

  fs.writeFileSync(filepath, buffer);

  logger.info('File uploaded', { filename, size: buffer.length, type: ext });

  return {
    filename,
    url: `/api/media/files/${filename}`,
    mediaType: ext,
  };
};

/**
 * Get the absolute path for a stored file
 * @param {string} filename
 * @returns {string | null}
 */
const getFilePath = (filename) => {
  const uploadDir = ensureUploadDir();
  const filepath = path.join(uploadDir, filename);

  if (!fs.existsSync(filepath)) return null;
  return filepath;
};

/**
 * Delete a stored file
 * @param {string} filename
 * @returns {boolean}
 */
const deleteFile = (filename) => {
  const filepath = getFilePath(filename);
  if (!filepath) return false;

  fs.unlinkSync(filepath);
  logger.info('File deleted', { filename });
  return true;
};

/**
 * List all uploaded files
 * @returns {object[]}
 */
const listFiles = () => {
  const uploadDir = ensureUploadDir();
  const files = fs.readdirSync(uploadDir);

  return files.map((filename) => {
    const filepath = path.join(uploadDir, filename);
    const stats = fs.statSync(filepath);
    const ext = path.extname(filename).slice(1);

    return {
      filename,
      url: `/api/media/files/${filename}`,
      mediaType: ext,
      size: stats.size,
      createdAt: stats.birthtime,
    };
  });
};

module.exports = {
  saveFile,
  getFilePath,
  deleteFile,
  listFiles,
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
};
