const { success, error } = require('../utils/responseWrapper');
const mediaService = require('../services/mediaService');
const mediaReferenceService = require('../services/mediaReferenceService');
const { serveMediaFile } = require('../utils/serveMediaFile');

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
    const files = await mediaService.listFiles();
    return success(files, 'Files listed');
  });

  fastify.get('/library', async () => {
    const items = await mediaReferenceService.listMediaLibrary();
    return success(items, 'Media library');
  });

  fastify.get('/files/:filename', async (request, reply) => {
    const { filename } = request.params;
    return serveMediaFile(reply, filename);
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
