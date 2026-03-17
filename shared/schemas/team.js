const { z } = require('zod');

const addTeamSchema = z.object({
  teamName: z.string().min(1).max(50).trim(),
  score: z.number().int().default(0),
});

const editTeamScoreSchema = z.object({
  teamId: z.number().int().positive(),
  score: z.number().int(),
});

module.exports = { addTeamSchema, editTeamScoreSchema };
