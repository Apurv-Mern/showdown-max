const { getEliminationPoints } = require('shared/constants/scoring');

/**
 * Elimination: Incremental scoring (10–120 pts across 12 questions).
 * Wrong → knocked out. All-teams-wrong → no knockout, all lose points.
 */
const calculate = ({ question, responses, questionIndex, activeTeamIds }) => {
  const scores = {};
  const eliminations = [];
  const points = getEliminationPoints(questionIndex);
  const correctIndex = question.options.findIndex((o) => o.isCorrect);

  const correctTeams = [];
  const wrongTeams = [];

  for (const teamIdStr of activeTeamIds.map(String)) {
    const response = responses[teamIdStr];
    if (!response) {
      wrongTeams.push(teamIdStr);
      scores[teamIdStr] = -points;
      continue;
    }

    const isCorrect = response.selectedOptionIndex === correctIndex;
    if (isCorrect) {
      correctTeams.push(teamIdStr);
      scores[teamIdStr] = points;
    } else {
      wrongTeams.push(teamIdStr);
      scores[teamIdStr] = -points;
    }
  }

  const allWrong = correctTeams.length === 0 && wrongTeams.length > 0;

  if (!allWrong) {
    for (const teamId of wrongTeams) {
      eliminations.push(Number(teamId));
    }
  }

  return { scores, eliminations, allWrong };
};

module.exports = { calculate };
