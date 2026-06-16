/**
 * Merges class names, filtering out falsy values
 */
export const cn = (...classes: (string | undefined | null | false)[]): string => {
  return classes.filter(Boolean).join(' ');
};

/** Uppercase quiz copy for venue + player surfaces (questions, options, round names, etc.). */
export const toDisplayUpper = (text: string | null | undefined): string => {
  if (text == null) return '';
  const trimmed = String(text).trim();
  return trimmed ? trimmed.toUpperCase() : '';
};
