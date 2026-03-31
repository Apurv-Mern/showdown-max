'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const quizTitle = 'Demo Trivia Night';

    const [existingQuizRows] = await queryInterface.sequelize.query(
      'SELECT id FROM quizzes WHERE title = :title LIMIT 1',
      { replacements: { title: quizTitle } },
    );

    let quizId;
    if (existingQuizRows.length > 0) {
      quizId = existingQuizRows[0].id;
    } else {
      await queryInterface.bulkInsert('quizzes', [{
        title: quizTitle,
        description: 'A sample quiz for testing all round types',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }]);

      const [quizRows] = await queryInterface.sequelize.query(
        'SELECT id FROM quizzes WHERE title = :title ORDER BY id DESC LIMIT 1',
        { replacements: { title: quizTitle } },
      );
      quizId = quizRows[0].id;
    }

    const roundSeed = [
      {
        quizId,
        name: 'General Knowledge',
        type: 'MULTIPLE_CHOICE',
        order: 0,
        timerDuration: 30,
        createdAt: now,
        updatedAt: now,
      },
      {
        quizId,
        name: 'Wager Round',
        type: 'WAGER',
        order: 1,
        timerDuration: 30,
        createdAt: now,
        updatedAt: now,
      },
      {
        quizId,
        name: 'Music Round',
        type: 'MUSIC',
        order: 2,
        timerDuration: 30,
        createdAt: now,
        updatedAt: now,
      },
      {
        quizId,
        name: 'Elimination Round',
        type: 'ELIMINATION',
        order: 3,
        timerDuration: 20,
        createdAt: now,
        updatedAt: now,
      },
      {
        quizId,
        name: 'Majority Rules',
        type: 'MAJORITY_RULES',
        order: 4,
        timerDuration: 20,
        createdAt: now,
        updatedAt: now,
      },
    ];

    const [existingRoundRows] = await queryInterface.sequelize.query(
      'SELECT id, name FROM rounds WHERE quizId = :quizId',
      { replacements: { quizId } },
    );

    if (existingRoundRows.length === 0) {
      await queryInterface.bulkInsert('rounds', roundSeed);
    }

    const [roundRows] = await queryInterface.sequelize.query(
      'SELECT id, name FROM rounds WHERE quizId = :quizId',
      { replacements: { quizId } },
    );

    const roundIdByName = Object.fromEntries(roundRows.map((r) => [r.name, r.id]));
    const generalKnowledgeRoundId = roundIdByName['General Knowledge'];

    if (!generalKnowledgeRoundId) return;

    const [existingQuestionRows] = await queryInterface.sequelize.query(
      'SELECT id FROM questions WHERE roundId = :roundId LIMIT 1',
      { replacements: { roundId: generalKnowledgeRoundId } },
    );
    if (existingQuestionRows.length > 0) return;

    await queryInterface.bulkInsert('questions', [
      {
        roundId: generalKnowledgeRoundId,
        text: 'What is the capital of France?',
        options: JSON.stringify([
          { text: 'London', isCorrect: false },
          { text: 'Paris', isCorrect: true },
          { text: 'Berlin', isCorrect: false },
          { text: 'Madrid', isCorrect: false },
        ]),
        category: 'Geography',
        order: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        roundId: generalKnowledgeRoundId,
        text: 'Which planet is known as the Red Planet?',
        options: JSON.stringify([
          { text: 'Venus', isCorrect: false },
          { text: 'Mars', isCorrect: true },
          { text: 'Jupiter', isCorrect: false },
        ]),
        category: 'Science',
        order: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        roundId: generalKnowledgeRoundId,
        text: 'Is the Earth flat?',
        options: JSON.stringify([
          { text: 'Yes', isCorrect: false },
          { text: 'No', isCorrect: true },
        ]),
        category: 'Science',
        order: 2,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('questions', null, {});
    await queryInterface.bulkDelete('rounds', null, {});
    await queryInterface.bulkDelete('quizzes', null, {});
  },
};
