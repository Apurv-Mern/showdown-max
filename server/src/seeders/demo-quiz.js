'use strict';

module.exports = {
  async up(queryInterface) {
    const [quiz] = await queryInterface.bulkInsert('quizzes', [{
      title: 'Demo Trivia Night',
      description: 'A sample quiz for testing all round types',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }], { returning: true });

    const quizId = quiz || 1;

    await queryInterface.bulkInsert('rounds', [
      {
        quizId,
        name: 'General Knowledge',
        type: 'MULTIPLE_CHOICE',
        order: 0,
        timerDuration: 30,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        quizId,
        name: 'Wager Round',
        type: 'WAGER',
        order: 1,
        timerDuration: 30,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        quizId,
        name: 'Music Round',
        type: 'MUSIC',
        order: 2,
        timerDuration: 30,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        quizId,
        name: 'Elimination Round',
        type: 'ELIMINATION',
        order: 3,
        timerDuration: 20,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        quizId,
        name: 'Majority Rules',
        type: 'MAJORITY_RULES',
        order: 4,
        timerDuration: 20,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await queryInterface.bulkInsert('questions', [
      {
        roundId: 1,
        text: 'What is the capital of France?',
        options: JSON.stringify([
          { text: 'London', isCorrect: false },
          { text: 'Paris', isCorrect: true },
          { text: 'Berlin', isCorrect: false },
          { text: 'Madrid', isCorrect: false },
        ]),
        category: 'Geography',
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        roundId: 1,
        text: 'Which planet is known as the Red Planet?',
        options: JSON.stringify([
          { text: 'Venus', isCorrect: false },
          { text: 'Mars', isCorrect: true },
          { text: 'Jupiter', isCorrect: false },
        ]),
        category: 'Science',
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        roundId: 1,
        text: 'Is the Earth flat?',
        options: JSON.stringify([
          { text: 'Yes', isCorrect: false },
          { text: 'No', isCorrect: true },
        ]),
        category: 'Science',
        order: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('questions', null, {});
    await queryInterface.bulkDelete('rounds', null, {});
    await queryInterface.bulkDelete('quizzes', null, {});
  },
};
