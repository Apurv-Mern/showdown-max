/** Figma Select Kangaroo (node 2114:8316). */
export const KANGAROO_SELECT_ASSETS = {
  bgHalo: '/figma/kangaroo-select/bg-halo.png',
  hero: '/figma/kangaroo-select/kangaroo-hero.png',
  heroShadow: '/figma/kangaroo-select/hero-shadow.svg',
  footerBar: '/figma/kangaroo-select/footer-bar.svg',
} as const;

export const KANGAROO_CHOICE_STYLES = [
  { frame: '/figma/kangaroo-select/frame-0.svg', effect: '/figma/kangaroo-select/effect-0.png' },
  { frame: '/figma/kangaroo-select/frame-1.svg', effect: '/figma/kangaroo-select/effect-1.png' },
  { frame: '/figma/kangaroo-select/frame-2.svg', effect: '/figma/kangaroo-select/effect-2.png' },
  { frame: '/figma/kangaroo-select/frame-3.svg', effect: '/figma/kangaroo-select/effect-3.png' },
  { frame: '/figma/kangaroo-select/frame-4.svg', effect: '/figma/kangaroo-select/effect-4.png' },
  { frame: '/figma/kangaroo-select/frame-5.svg', effect: '/figma/kangaroo-select/effect-5.png' },
] as const;

export function kangarooChoiceStyleForIndex(index: number) {
  return KANGAROO_CHOICE_STYLES[index % KANGAROO_CHOICE_STYLES.length];
}
