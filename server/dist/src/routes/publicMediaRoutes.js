const mediaService = require('../services/mediaService');
const { serveMediaFile } = require('../utils/serveMediaFile');

/**
 * Public media file routes for venue/player rendering.
 * @param {import('fastify').FastifyInstance} fastify
 */
const publicMediaRoutes = async (fastify) => {
  fastify.get('/files/:filename', async (request, reply) => {
    const { filename } = request.params;
    return serveMediaFile(reply, filename);
  });
};

module.exports = publicMediaRoutes;
