/**
 * Figma Max Showdown Dev tokens (Page 1 player + venue frames).
 * Source: https://www.figma.com/design/JoPgI2aw16JXEohkaBYDQ4
 */
export const figmaColors = {
  bgFrom: '#00072F',
  bgTo: '#00010A',
  cyan: '#00D9FF',
  cyanDeep: '#0010FF',
  green: '#38FF00',
  white: '#FFFFFF',
  joinFrom: '#FF0000',
  joinTo: '#250000',
  inputGlow: '0 0 5px 5px rgba(0, 217, 255, 0.2)',
  titleGlow: '0 0 5px #0010FF, 0 0 2px #00D9FF',
  hudGlow: '0 0 10px #0010FF',
} as const;

export const figmaRadius = {
  sm: '6px',
  md: '8px',
  lg: '10px',
  pill: '999px',
  venueOption: '20px',
} as const;

export const figmaSpacing = {
  screenX: '20px',
  optionGap: '20px',
  fieldGap: '30px',
} as const;

/** A–F letter / wager / CoC accent colors from Figma choice bars. */
export const FIGMA_OPTION_ACCENTS = [
  { accent: '#0085FF', from: '#0085FF', to: '#002BB5' },
  { accent: '#FF6F00', from: '#FF6F00', to: '#994200' },
  { accent: '#38FF00', from: '#38FF00', to: '#007B00' },
  { accent: '#FFCC00', from: '#FFCC00', to: '#FFA600' },
  { accent: '#8B00FF', from: '#8B00FF', to: '#4A0080' },
  { accent: '#FF0000', from: '#FF0000', to: '#990003' },
] as const;

export const FIGMA_OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export function optionAccent(index: number) {
  return FIGMA_OPTION_ACCENTS[index % FIGMA_OPTION_ACCENTS.length];
}

/** Venue 1920×1080 tokens from Figma Page 1. */
export const VENUE_LOGO_SRC = '/logo.png';

export const venueColors = {
  navyFrom: '#00072F',
  navyTo: '#00010A',
  cyan: '#00D9FF',
  cyanDeep: '#0010FF',
  green: '#38FF00',
  red: '#FF0000',
  muted: '#7F8084',
  hexPlate: '#0010FF',
  slotNavy: '#0010AA',
  badge: '#040040',
  questionGlow: '0 0 24px rgba(0, 217, 255, 0.45)',
} as const;
