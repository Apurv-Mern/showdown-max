/** Figma player wager buttons (node 2114:6775) and locked screen (2114:6668). */
export const PLAYER_WAGER_CHOICE_STYLES = [
  { frame: '/figma/player-wager/frame-0.svg', effect: '/figma/player-wager/effect-0.png' },
  { frame: '/figma/player-wager/frame-10.svg', effect: '/figma/player-wager/effect-10.png' },
  { frame: '/figma/player-wager/frame-20.svg', effect: '/figma/player-wager/effect-20.png' },
  { frame: '/figma/player-wager/frame-30.svg', effect: '/figma/player-wager/effect-30.png' },
  { frame: '/figma/player-wager/frame-40.svg', effect: '/figma/player-wager/effect-40.png' },
  { frame: '/figma/player-wager/frame-50.svg', effect: '/figma/player-wager/effect-50.png' },
] as const;

export const PLAYER_WAGER_LOCKED_ASSETS = {
  halo: '/figma/player-wager/locked-halo.png',
  ring: '/figma/player-wager/locked-ring.svg',
  lockIcon: '/figma/player-wager/locked-icon.svg',
  summaryBar: '/figma/player-wager/locked-summary-bar.svg',
} as const;

export function playerWagerChoiceStyleForIndex(index: number) {
  return PLAYER_WAGER_CHOICE_STYLES[index % PLAYER_WAGER_CHOICE_STYLES.length];
}
