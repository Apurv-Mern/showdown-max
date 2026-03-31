const path = require('path');
const { error } = require('../utils/responseWrapper');
const mediaService = require('../services/mediaService');

/**
 * Public media file routes for venue/player rendering.
 * @param {import('fastify').FastifyInstance} fastify
 */
const publicMediaRoutes = async (fastify) => {
  fastify.get('/files/:filename', async (request, reply) => {
    const { filename } = request.params;
    const filepath = mediaService.getFilePath(filename);

    if (!filepath) {
      reply.status(404);
      return error('File not found', 404);
    }

    const ext = path.extname(filename).slice(1).toLowerCase();
    const mimeMap = {
      mp3: 'audio/mpeg',
      mp4: 'video/mp4',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    const fs = require('fs');
    const stream = fs.createReadStream(filepath);
    reply.type(contentType);
    return reply.send(stream);
  });
};

module.exports = publicMediaRoutes;
