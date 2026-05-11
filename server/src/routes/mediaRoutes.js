const path = require('path');
const { success, error } = require('../utils/responseWrapper');
const mediaService = require('../services/mediaService');
const mediaReferenceService = require('../services/mediaReferenceService');

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

  fastify.get('/library', async () => {
    const items = await mediaReferenceService.listMediaLibrary();
    return success(items, 'Media library');
  });

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

  fastify.delete('/files/:filename', async (request, reply) => {
    const raw = request.params.filename;
    const filename = typeof raw === 'string' ? decodeURIComponent(raw) : raw;
    const { deleted, detachedQuestionCount } =
      await mediaReferenceService.detachQuestionsAndDeleteFile(filename);

    if (!deleted) {
      reply.status(404);
      return error('File not found', 404);
    }
    return success({ detachedQuestionCount }, 'File deleted');
  });
};

module.exports = mediaRoutes;
