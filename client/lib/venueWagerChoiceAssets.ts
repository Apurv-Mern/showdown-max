/** Figma venue wager grid (node 2114:3050) — frame SVG + corner halftone per slot. */
export const VENUE_WAGER_CHOICE_STYLES = [
  { frame: '/figma/wager/frame-0.svg', effect: '/figma/wager/effect-0.png' },
  { frame: '/figma/wager/frame-10.svg', effect: '/figma/wager/effect-10.png' },
  { frame: '/figma/wager/frame-20.svg', effect: '/figma/wager/effect-20.png' },
  { frame: '/figma/wager/frame-30.svg', effect: '/figma/wager/effect-30.png' },
  { frame: '/figma/wager/frame-40.svg', effect: '/figma/wager/effect-40.png' },
  { frame: '/figma/wager/frame-50.svg', effect: '/figma/wager/effect-50.png' },
] as const;

export function venueWagerChoiceStyleForIndex(index: number) {
  return VENUE_WAGER_CHOICE_STYLES[index % VENUE_WAGER_CHOICE_STYLES.length];
}
