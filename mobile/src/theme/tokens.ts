/**
 * The only color values allowed in the app. Every view, border and glyph maps to one of these.
 *
 * `surfaceNatural` is specified as `#FF4E5C2` in the hardware design spec, which is not a valid
 * hex color (7 digits). `#F4E5C2` is the almond/cream value the spec describes.
 */
export const SONGA_THEME = {
  background: '#F9F7F8',
  surfaceNatural: '#F4E5C2',
  primaryAccent: '#0B8457',
  secondaryAccent: '#096C47',
  textDark: '#323232',
  textMuted: '#646464',
} as const;

export type SongaColorToken = keyof typeof SONGA_THEME;
