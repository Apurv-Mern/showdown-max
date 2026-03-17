const { z } = require('zod');

const submitAnswerSchema = z.object({
  questionId: z.number().int().positive(),
  selectedOptionIndex: z.number().int().min(0).max(5),
});

const submitWagerSchema = z.object({
  amount: z.number().int().min(0).max(50).optional(),
  percentage: z.number().int().min(0).max(100).optional(),
}).refine(
  (data) => data.amount !== undefined || data.percentage !== undefined,
  { message: 'Either amount or percentage must be provided' },
);

module.exports = { submitAnswerSchema, submitWagerSchema };
