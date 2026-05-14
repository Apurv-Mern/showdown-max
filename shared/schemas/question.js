const { z } = require('zod');

const answerOptionSchema = z.object({
  text: z.string().min(1).max(500),
  isCorrect: z.boolean(),
  correctOrder: z.number().int().min(1).max(6).optional(),
});

const baseQuestionSchema = z.object({
  text: z.string().min(1).max(1000),
  options: z.array(answerOptionSchema).min(2).max(6),
  category: z.string().max(100).optional(),
  mediaUrl: z.string().max(500).optional(),
  mediaType: z.enum(['mp3', 'mp4', 'image']).optional(),
  roundId: z.number().int().positive().optional(),
  timerDuration: z.number().int().min(5).max(300).optional(),
});

const createQuestionSchema = baseQuestionSchema.refine(
  (data) => {
    const isOrdering = data.options.some((o) => typeof o.correctOrder === 'number');
    if (isOrdering) return true;
    return data.options.filter((o) => o.isCorrect).length >= 1;
  },
  { message: 'At least one option must be marked as correct, unless it is an Ordering question' },
);

const updateQuestionSchema = baseQuestionSchema.partial();

module.exports = { answerOptionSchema, createQuestionSchema, updateQuestionSchema };
