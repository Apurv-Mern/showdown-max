const crypto = require('crypto');
const { z } = require('zod');
const { Op } = require('sequelize');
const { HostAccount, Session, Quiz } = require('../models');
const { success, error } = require('../utils/responseWrapper');
const { validateBody, validateParams } = require('../middleware/validateRequest');

const hashPassword = (password) => crypto.createHash('sha256').update(password).digest('hex');

const hostIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

const createHostSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4).max(128),
  sessionId: z.number().int().positive(),
});

const updateHostSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(4).max(128).optional(),
  sessionId: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});

const getAssignableSession = async (sessionId) => {
  return Session.findOne({
    where: { id: sessionId, status: 'pending' },
    include: [{ model: Quiz, as: 'quiz', attributes: ['id', 'title'] }],
  });
};

const hostRoutes = async (fastify) => {
  fastify.get('/', async () => {
    const hosts = await HostAccount.findAll({
      include: [{
        model: Session,
        as: 'assignedSession',
        attributes: ['id', 'pin', 'status'],
        include: [{ model: Quiz, as: 'quiz', attributes: ['id', 'title'] }],
      }],
      order: [['createdAt', 'DESC']],
    });
    return success(hosts, 'Host accounts fetched');
  });

  fastify.post('/', {
    preHandler: [validateBody(createHostSchema)],
  }, async (request, reply) => {
    const { email, password, sessionId } = request.body;

    const session = await getAssignableSession(sessionId);
    if (!session) {
      reply.status(404);
      return error('Session not found', 404);
    }

    const existingEmail = await HostAccount.findOne({ where: { email } });
    if (existingEmail) {
      reply.status(409);
      return error('Host account with this email already exists', 409);
    }

    const existingAssignment = await HostAccount.findOne({ where: { sessionId } });
    if (existingAssignment) {
      reply.status(409);
      return error('This session is already assigned to another host', 409);
    }

    const host = await HostAccount.create({
      email,
      passwordHash: hashPassword(password),
      sessionId,
      isActive: true,
    });

    const created = await HostAccount.findByPk(host.id, {
      include: [{
        model: Session,
        as: 'assignedSession',
        attributes: ['id', 'pin', 'status'],
        include: [{ model: Quiz, as: 'quiz', attributes: ['id', 'title'] }],
      }],
    });

    reply.status(201);
    return success(created, 'Host account created');
  });

  fastify.patch('/:id', {
    preHandler: [validateParams(hostIdParamSchema), validateBody(updateHostSchema)],
  }, async (request, reply) => {
    const host = await HostAccount.findByPk(request.params.id);
    if (!host) {
      reply.status(404);
      return error('Host account not found', 404);
    }

    const { email, password, sessionId, isActive } = request.body;

    if (email && email !== host.email) {
      const emailTaken = await HostAccount.findOne({ where: { email } });
      if (emailTaken) {
        reply.status(409);
        return error('Host account with this email already exists', 409);
      }
    }

    if (sessionId !== undefined && sessionId !== null) {
      const session = await getAssignableSession(sessionId);
      if (!session) {
        reply.status(404);
        return error('Session not found', 404);
      }

      const assignment = await HostAccount.findOne({ where: { sessionId } });
      if (assignment && assignment.id !== host.id) {
        reply.status(409);
        return error('This session is already assigned to another host', 409);
      }
    }

    await host.update({
      ...(email !== undefined ? { email } : {}),
      ...(password !== undefined ? { passwordHash: hashPassword(password) } : {}),
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    });

    const updated = await HostAccount.findByPk(host.id, {
      include: [{
        model: Session,
        as: 'assignedSession',
        attributes: ['id', 'pin', 'status'],
        include: [{ model: Quiz, as: 'quiz', attributes: ['id', 'title'] }],
      }],
    });

    return success(updated, 'Host account updated');
  });

  fastify.delete('/:id', {
    preHandler: [validateParams(hostIdParamSchema)],
  }, async (request, reply) => {
    const host = await HostAccount.findByPk(request.params.id);
    if (!host) {
      reply.status(404);
      return error('Host account not found', 404);
    }

    await host.destroy();
    return success(null, 'Host account deleted');
  });
};

module.exports = hostRoutes;
