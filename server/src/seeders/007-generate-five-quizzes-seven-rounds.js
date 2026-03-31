'use strict';

const QUESTIONS_PER_ROUND = 10;
const QUIZ_TITLE_PREFIX = 'Auto Generated Quiz';
const QUIZ_DEFINITIONS = [
  {
    code: 1,
    title: 'Global Mix Challenge',
    description: 'A balanced all-rounder quiz across GK, music, wagering, and finals.',
  },
  {
    code: 2,
    title: 'Tech & Pop Culture Showdown',
    description: 'Technology, media, and modern culture focused showdown set.',
  },
  {
    code: 3,
    title: 'Science & Logic Arena',
    description: 'Science-forward quiz with logical and analytical question themes.',
  },
  {
    code: 4,
    title: 'Sports, Movies & Trends',
    description: 'Fast-paced mix of sports, film, and popular trend knowledge.',
  },
  {
    code: 5,
    title: 'Ultimate Finals Edition',
    description: 'High-stakes ladder with strong elimination and final wager pacing.',
  },
];

const ROUND_BLUEPRINT = [
  { name: 'Round 1 - Multiple Choice', type: 'MULTIPLE_CHOICE', timerDuration: 30 },
  { name: 'Round 2 - Wager', type: 'WAGER', timerDuration: 30 },
  { name: 'Round 3 - Music', type: 'MUSIC', timerDuration: 30 },
  { name: 'Round 4 - Elimination', type: 'ELIMINATION', timerDuration: 25 },
  { name: 'Round 5 - Majority Rules', type: 'MAJORITY_RULES', timerDuration: 25 },
  { name: 'Round 6 - Final Multiple Choice', type: 'FINAL_MULTIPLE_CHOICE', timerDuration: 30 },
  { name: 'Final Round - Final Wager', type: 'FINAL_WAGER', timerDuration: 30 },
];

const buildQuestionText = (quizNo, roundName, roundType, questionNo) => {
  const base = `Quiz ${quizNo} | ${roundName} | Question ${questionNo}`;
  switch (roundType) {
    case 'WAGER':
      return `${base}: Wager before answering. Which option is correct?`;
    case 'MUSIC':
      return `${base}: Listen to the audio clue and pick the best match.`;
    case 'ELIMINATION':
      return `${base}: Elimination challenge - answer correctly to survive.`;
    case 'MAJORITY_RULES':
      return `${base}: Choose what you think most teams will pick.`;
    case 'FINAL_WAGER':
      return `${base}: Final wager question - choose the best answer.`;
    default:
      return `${base}: Select the correct answer.`;
  }
};

const buildOptions = (optionCount, correctIndex) =>
  Array.from({ length: optionCount }).map((_, idx) => ({
    text: `Option ${idx + 1}`,
    isCorrect: idx === correctIndex,
  }));

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    for (const quizDef of QUIZ_DEFINITIONS) {
      const quizNo = quizDef.code;
      const title = quizDef.title;
      const description = quizDef.description;

      const [existingQuizRows] = await queryInterface.sequelize.query(
        'SELECT id FROM quizzes WHERE title LIKE :titlePrefix LIMIT 1',
        { replacements: { titlePrefix: `${QUIZ_TITLE_PREFIX} ${quizNo}%` } },
      );

      if (existingQuizRows.length > 0) {
        continue;
      }

      await queryInterface.bulkInsert('quizzes', [{
        title,
        description,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }]);

      const [quizRows] = await queryInterface.sequelize.query(
        'SELECT id FROM quizzes WHERE title = :title ORDER BY id DESC LIMIT 1',
        { replacements: { title } },
      );
      const quizId = quizRows[0].id;

      const roundRows = ROUND_BLUEPRINT.map((round, index) => ({
        quizId,
        name: round.name,
        type: round.type,
        order: index,
        timerDuration: round.timerDuration,
        createdAt: now,
        updatedAt: now,
      }));

      await queryInterface.bulkInsert('rounds', roundRows);

      const [createdRounds] = await queryInterface.sequelize.query(
        'SELECT id, name, type FROM rounds WHERE quizId = :quizId ORDER BY `order` ASC',
        { replacements: { quizId } },
      );

      const questions = [];
      for (const round of createdRounds) {
        for (let qIdx = 0; qIdx < QUESTIONS_PER_ROUND; qIdx += 1) {
          const optionCount = 2 + ((quizNo + qIdx + round.id) % 5);
          const correctIndex = (quizNo + qIdx) % optionCount;

          questions.push({
            roundId: round.id,
            text: buildQuestionText(quizNo, round.name, round.type, qIdx + 1),
            options: JSON.stringify(buildOptions(optionCount, correctIndex)),
            category: round.type,
            order: qIdx,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      await queryInterface.bulkInsert('questions', questions);
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM questions
      WHERE roundId IN (
        SELECT id FROM rounds
        WHERE quizId IN (
          SELECT id FROM quizzes WHERE title LIKE '${QUIZ_TITLE_PREFIX}%'
        )
      )
    `);

    await queryInterface.sequelize.query(`
      DELETE FROM rounds
      WHERE quizId IN (
        SELECT id FROM quizzes WHERE title LIKE '${QUIZ_TITLE_PREFIX}%'
      )
    `);

    await queryInterface.sequelize.query(`
      DELETE FROM quizzes
      WHERE title LIKE '${QUIZ_TITLE_PREFIX}%'
    `);
  },
};
