export type EliminationLeaderboardTeam = {
  teamId: number;
  teamName: string;
  score: number;
  isEliminated?: boolean;
};

export function isEliminationRoundType(roundType?: string): boolean {
  return (roundType || '').toUpperCase() === 'ELIMINATION';
}

/** Survivors first (score desc), then knocked out (score desc). */
export function sortTeamsForEliminationLeaderboard<T extends EliminationLeaderboardTeam>(
  teams: T[],
): T[] {
  const survivors: T[] = [];
  const eliminated: T[] = [];
  for (const t of teams) {
    if (t.isEliminated) eliminated.push(t);
    else survivors.push(t);
  }
  const byScore = (a: T, b: T) => Number(b.score ?? 0) - Number(a.score ?? 0);
  survivors.sort(byScore);
  eliminated.sort(byScore);
  return [...survivors, ...eliminated];
}

export function prepareLeaderboardTeams<T extends EliminationLeaderboardTeam>(
  teams: T[],
  eliminationStyle: boolean,
): T[] {
  if (!eliminationStyle) {
    return [...teams].sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
  }
  return sortTeamsForEliminationLeaderboard(teams);
}

export const eliminationLeaderboardRowClasses = {
  eliminated:
    'opacity-50 border-white/10 bg-white/[0.03] text-white/45 shadow-none',
  survivor: 'neon-border-strong border-[#12ddff]/50 bg-white/[0.07]',
} as const;
