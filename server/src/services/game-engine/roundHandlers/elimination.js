const { getEliminationPoints } = require('shared/constants/scoring');

/**
 * Elimination: Incremental scoring (10–120 pts across 12 questions).
 * Wrong → knocked out. All-teams-wrong → no knockout, all lose points.
 */
const calculate = ({ question, responses, questionIndex, activeTeamIds }) => {
  const scores = {};
  const eliminations = [];
  const points = getEliminationPoints(questionIndex);
  const isOrdering = question.options.some((o) => o.correctOrder !== undefined);
  let correctOrderStr = null;
  let correctIndex = -1;

  if (isOrdering) {
    const expectedOrder = [...question.options]
      .map((o, idx) => ({ idx, order: o.correctOrder }))
      .sort((a, b) => a.order - b.order)
      .map((x) => x.idx);
    correctOrderStr = JSON.stringify(expectedOrder);
  } else {
    correctIndex = question.options.findIndex((o) => o.isCorrect);
  }

  const correctTeams = [];
  const wrongTeams = [];

  for (const teamIdStr of activeTeamIds.map(String)) {
    const response = responses[teamIdStr];
    if (!response) {
      wrongTeams.push(teamIdStr);
      scores[teamIdStr] = -points;
      continue;
    }

    let isCorrect = false;
    if (isOrdering) {
      if (Array.isArray(response.selectedOptionIndex)) {
        isCorrect = JSON.stringify(response.selectedOptionIndex) === correctOrderStr;
      }
    } else {
      isCorrect = Number(response.selectedOptionIndex) === correctIndex;
    }
    if (isCorrect) {
      correctTeams.push(teamIdStr);
      scores[teamIdStr] = points;
    } else {
      wrongTeams.push(teamIdStr);
      scores[teamIdStr] = -points;
    }
  }

  const allWrong = correctTeams.length === 0 && wrongTeams.length > 0;

  for (const teamId of wrongTeams) {
    eliminations.push(Number(teamId));
  }

  return { scores, eliminations, allWrong };
};

module.exports = { calculate };
