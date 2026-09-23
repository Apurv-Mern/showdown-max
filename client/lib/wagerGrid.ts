/** Shared wager / final-wager step grids (2×3: left col 0/20/40, right col 10/30/50). */

export const WAGER_POINT_OPTIONS = [0, 10, 20, 30, 40, 50] as const;
export const FINAL_WAGER_PERCENT_OPTIONS = [0, 20, 40, 60, 80, 100] as const;

export const STANDARD_WAGER_GRID: readonly (typeof WAGER_POINT_OPTIONS)[number][] = [
  0, 10, 20, 30, 40, 50,
];

export const FINAL_WAGER_GRID: readonly (typeof FINAL_WAGER_PERCENT_OPTIONS)[number][] = [
  0, 20, 40, 60, 80, 100,
];

export const WAGER_TILE_CLASS: Record<number, string> = {
  0: 'bg-linear-to-b from-[#0190F5] to-[#015FB4]',
  10: 'bg-linear-to-b from-[#FF6F00] to-[#994200]',
  20: 'bg-linear-to-b from-[#2DA600] to-[#227E00]',
  30: 'bg-linear-to-b from-[#F29B00] to-[#B97700]',
  40: 'bg-linear-to-b from-[#460073] to-[#5C0098]',
  50: 'bg-linear-to-b from-[#990003] to-[#D20023]',
};

export function tileClassForWagerValue(value: number, isFinalWager: boolean): string {
  if (!isFinalWager) {
    return WAGER_TILE_CLASS[value] ?? 'bg-linear-to-b from-[#1565c0] to-[#0d47a1]';
  }
  const idx = FINAL_WAGER_GRID.indexOf(value as (typeof FINAL_WAGER_PERCENT_OPTIONS)[number]);
  const standardVal = STANDARD_WAGER_GRID[Math.max(0, idx)] ?? 0;
  return WAGER_TILE_CLASS[standardVal] ?? 'bg-linear-to-b from-[#1565c0] to-[#0d47a1]';
}

export function formatWagerGridLabel(value: number, isFinalWager: boolean): string {
  return isFinalWager ? `${value}%` : String(value);
}

export function wagerInstructionText(isFinalWager: boolean): string {
  return isFinalWager
    ? 'Select the percentage you want to risk'
    : 'Select the points you want to wager';
}

export function playerWagerTitle(isFinalWager: boolean): string {
  return isFinalWager ? 'PLACE YOUR FINAL BETS' : 'PLACE YOUR WAGER';
}

export function playerWagerSubtitle(isFinalWager: boolean): string {
  return isFinalWager
    ? 'WHAT PERCENTAGE OF OUR OVERALL SCORES ARE WE WILLING TO RISK?'
    : 'SELECT HOW MANY POINTS YOU WANT TO WAGER';
}

/** Circle display — numeric only (no % suffix), matching player mock. */
export function formatWagerCircleValue(value: number): string {
  return String(value);
}

/** Button face — mock shows plain numbers; final wager appends %. */
export function formatWagerButtonLabel(value: number, isFinalWager: boolean): string {
  return isFinalWager ? `${value}%` : String(value);
}

export function emptyWagerDistributionCounts(isFinalWager: boolean): Record<string, number> {
  const grid = isFinalWager ? FINAL_WAGER_GRID : STANDARD_WAGER_GRID;
  return Object.fromEntries(grid.map((v) => [String(v), 0]));
}
