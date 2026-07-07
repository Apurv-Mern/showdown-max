const fs = require('fs');
const path = require('path');
const { env } = require('../../config/env');
const logger = require('../../utils/logger');
const { contentTypeForFilename } = require('../../utils/mediaMime');

const ensureUploadDir = () => {
  const uploadPath = path.resolve(env.UPLOAD_DIR);
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }
  return uploadPath;
};

const getFilePath = (filename) => {
  const uploadDir = ensureUploadDir();
  const filepath = path.join(uploadDir, filename);
  if (!fs.existsSync(filepath)) return null;
  return filepath;
};

const saveFile = async ({ filename, buffer }) => {
  const uploadDir = ensureUploadDir();
  const filepath = path.join(uploadDir, filename);
  fs.writeFileSync(filepath, buffer);
  logger.info('File saved to local storage', { filename, size: buffer.length });
  return {
    filename,
    url: `/api/media/files/${filename}`,
  };
};

const deleteFile = (filename) => {
  const filepath = getFilePath(filename);
  if (!filepath) return false;
  fs.unlinkSync(filepath);
  logger.info('File deleted from local storage', { filename });
  return true;
};

const listFiles = () => {
  const uploadDir = ensureUploadDir();
  if (!fs.existsSync(uploadDir)) return [];

  return fs.readdirSync(uploadDir).map((filename) => {
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

const fileExists = (filename) => Boolean(getFilePath(filename));

const getFileStream = (filename) => {
  const filepath = getFilePath(filename);
  if (!filepath) return null;

  return {
    stream: fs.createReadStream(filepath),
    contentType: contentTypeForFilename(filename),
  };
};

const getPublicUrl = () => null;

module.exports = {
  saveFile,
  deleteFile,
  listFiles,
  fileExists,
  getFileStream,
  getPublicUrl,
  getFilePath,
};
