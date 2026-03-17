const { z } = require('zod');

const createSessionSchema = z.object({
  quizId: z.number().int().positive(),
  maxTeams: z.number().int().min(1).max(500).default(50),
});

const joinSessionSchema = z.object({
  pin: z.string().length(6),
  teamName: z.string().min(1).max(50).trim(),
});

module.exports = { createSessionSchema, joinSessionSchema };
