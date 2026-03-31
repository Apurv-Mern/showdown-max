'use strict';

const RENAMES = [
  {
    from: 'Auto Generated Quiz 1',
    to: 'Global Mix Challenge',
    description: 'A balanced all-rounder quiz across GK, music, wagering, and finals.',
  },
  {
    from: 'Auto Generated Quiz 2',
    to: 'Tech & Pop Culture Showdown',
    description: 'Technology, media, and modern culture focused showdown set.',
  },
  {
    from: 'Auto Generated Quiz 3',
    to: 'Science & Logic Arena',
    description: 'Science-forward quiz with logical and analytical question themes.',
  },
  {
    from: 'Auto Generated Quiz 4',
    to: 'Sports, Movies & Trends',
    description: 'Fast-paced mix of sports, film, and popular trend knowledge.',
  },
  {
    from: 'Auto Generated Quiz 5',
    to: 'Ultimate Finals Edition',
    description: 'High-stakes ladder with strong elimination and final wager pacing.',
  },
];

module.exports = {
  async up(queryInterface) {
    for (const item of RENAMES) {
      await queryInterface.bulkUpdate(
        'quizzes',
        {
          title: item.to,
          description: item.description,
          updatedAt: new Date(),
        },
        { title: item.from },
      );
    }
  },

  async down(queryInterface) {
    for (const item of RENAMES) {
      await queryInterface.bulkUpdate(
        'quizzes',
        {
          title: item.from,
          updatedAt: new Date(),
        },
        { title: item.to },
      );
    }
  },
};

