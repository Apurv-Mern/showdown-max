/**
 * Creates a Fastify preHandler that validates request body against a Zod schema
 * @param {import('zod').ZodSchema} schema
 * @returns {Function} Fastify preHandler
 */
const validateBody = (schema) => async (request, reply) => {
  const result = schema.safeParse(request.body);

  if (!result.success) {
    reply.status(400).send({
      success: false,
      error: 'Validation failed',
      details: result.error.flatten().fieldErrors,
      statusCode: 400,
    });
    return;
  }

  request.body = result.data;
};

/**
 * Creates a Fastify preHandler that validates request params against a Zod schema
 * @param {import('zod').ZodSchema} schema
 * @returns {Function} Fastify preHandler
 */
const validateParams = (schema) => async (request, reply) => {
  const result = schema.safeParse(request.params);

  if (!result.success) {
    reply.status(400).send({
      success: false,
      error: 'Invalid parameters',
      details: result.error.flatten().fieldErrors,
      statusCode: 400,
    });
    return;
  }

  request.params = result.data;
};

module.exports = { validateBody, validateParams };
