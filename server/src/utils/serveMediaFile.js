const { error } = require('./responseWrapper');
const mediaService = require('../services/mediaService');
const { env } = require('../config/env');

/**
 * Serve a media file from storage (redirect to S3 public URL or stream).
 * @param {import('fastify').FastifyReply} reply
 * @param {string} filename
 */
const serveMediaFile = async (reply, filename) => {
  if (env.STORAGE_BACKEND === 's3') {
    const publicUrl = mediaService.getPublicUrl(filename);
    if (publicUrl) {
      return reply.redirect(publicUrl);
    }
  }

  const file = await mediaService.getFileStream(filename);
  if (!file) {
    reply.status(404);
    return error('File not found', 404);
  }

  reply.type(file.contentType);
  return reply.send(file.stream);
};

module.exports = { serveMediaFile };
