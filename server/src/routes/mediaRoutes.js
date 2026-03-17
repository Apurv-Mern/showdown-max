const path = require('path');
const { success, error } = require('../utils/responseWrapper');
const mediaService = require('../services/mediaService');

/**
 * @param {import('fastify').FastifyInstance} fastify
 */
const mediaRoutes = async (fastify) => {
  await fastify.register(require('@fastify/multipart'), {
    limits: {
      fileSize: mediaService.MAX_FILE_SIZE,
    },
  });

  fastify.post('/upload', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      reply.status(400);
      return error('No file uploaded', 400);
    }

    const result = await mediaService.saveFile(file);
    reply.status(201);
    return success(result, 'File uploaded');
  });

  fastify.get('/files', async () => {
    const files = mediaService.listFiles();
    return success(files, 'Files listed');
  });

  fastify.get('/files/:filename', async (request, reply) => {
    const { filename } = request.params;
    const filepath = mediaService.getFilePath(filename);

    if (!filepath) {
      reply.status(404);
      return error('File not found', 404);
    }

    const ext = path.extname(filename).slice(1);
    const mimeMap = { mp3: 'audio/mpeg', mp4: 'video/mp4' };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    const fs = require('fs');
    const stream = fs.createReadStream(filepath);
    reply.type(contentType);
    return reply.send(stream);
  });

  fastify.delete('/files/:filename', async (request, reply) => {
    const { filename } = request.params;
    const deleted = mediaService.deleteFile(filename);

    if (!deleted) {
      reply.status(404);
      return error('File not found', 404);
    }
    return success(null, 'File deleted');
  });
};

module.exports = mediaRoutes;
