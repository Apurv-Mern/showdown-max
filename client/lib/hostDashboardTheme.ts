/** Figma Host Control Dashboard (node 56:216) — layout + surface tokens. */
export const HOST_DASHBOARD = {
  pageBg: '#0b0f1a',
  panelBg: '#151b2b',
  panelBorder: '#888888',
  accent: '#00d9ff',
  accentGreen: '#38ff00',
  tileGradient: 'bg-gradient-to-b from-[#1a1f2e] to-[#0b0f1a]',
  /** Live responses / leaderboard */
  columnWidth: 'lg:w-[340px]',
  /** Question preview rail — compact, sits left of the main question */
  previewColumnWidth: 'lg:w-[300px]',
  /** Director tools — narrow strip on the far left after preview */
  directorColumnWidth: 'lg:w-[300px] lg:min-w-[300px]',
  footerHeight: 'h-[100px]',
} as const;

export const HOST_OPTION_BORDER: Record<number, string> = {
  0: '#0085ff',
  1: '#ff6f00',
  2: '#38ff00',
  3: '#ffcc00',
  4: '#ae00ff',
  5: '#ff0000',
};

/** Letter column + outer glow — host / venue-style answer tiles. */
export const HOST_OPTION_TILE_STYLES = [
  {
    border: '#00ffff',
    letter: 'bg-[linear-gradient(180deg,#008cff_0%,#003366_100%)]',
    glow: 'shadow-[0_0_14px_rgba(0,255,255,0.45)]',
  },
  {
    border: '#ff8c00',
    letter: 'bg-[linear-gradient(180deg,#ff4500_0%,#8b2500_100%)]',
    glow: 'shadow-[0_0_14px_rgba(255,140,0,0.45)]',
  },
  {
    border: '#32cd32',
    letter: 'bg-[linear-gradient(180deg,#008000_0%,#003300_100%)]',
    glow: 'shadow-[0_0_14px_rgba(50,205,50,0.45)]',
  },
  {
    border: '#ffd700',
    letter: 'bg-[linear-gradient(180deg,#daa520_0%,#664d00_100%)]',
    glow: 'shadow-[0_0_14px_rgba(255,215,0,0.4)]',
  },
  {
    border: '#9400d3',
    letter: 'bg-[linear-gradient(180deg,#4b0082_0%,#24003d_100%)]',
    glow: 'shadow-[0_0_14px_rgba(148,0,211,0.45)]',
  },
  {
    border: '#ff1493',
    letter: 'bg-[linear-gradient(180deg,#c71585_0%,#5c0a3d_100%)]',
    glow: 'shadow-[0_0_14px_rgba(255,20,147,0.45)]',
  },
] as const;

export const HOST_OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
