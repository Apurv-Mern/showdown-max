const { z } = require('zod');
const { ROUND_TYPES } = require('../constants/roundTypes');

const roundSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.nativeEnum(ROUND_TYPES),
  order: z.number().int().min(0),
  timerDuration: z.number().int().min(5).max(300).default(30),
  questionCount: z.number().int().min(1).max(50).default(10),
});

const createQuizSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  rounds: z.array(roundSchema).length(7),
});

const updateQuizSchema = createQuizSchema.partial().extend({
  rounds: z.array(roundSchema).length(7).optional(),
});

module.exports = { roundSchema, createQuizSchema, updateQuizSchema };
