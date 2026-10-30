import type { TextStyle } from 'react-native';

import { SONGA_THEME } from './tokens';

/** Fixed, absolute type scale. No fluid or screen-relative sizing. */
export const TYPOGRAPHY = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: SONGA_THEME.textDark },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: SONGA_THEME.textDark },
  subtitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: SONGA_THEME.textDark },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400', color: SONGA_THEME.textDark },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '600', color: SONGA_THEME.textDark },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400', color: SONGA_THEME.textMuted },
  metric: { fontSize: 44, lineHeight: 50, fontWeight: '800', color: SONGA_THEME.textDark },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof TYPOGRAPHY;
