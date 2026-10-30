import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { BORDERS, RADII, SONGA_THEME, SPACING } from '@/theme';

interface CardProps {
  children: ReactNode;
  /** `bordered` draws the hard charcoal outline used for informational overlays. */
  tone?: 'natural' | 'bordered' | 'plain';
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, tone = 'natural', style }: CardProps) {
  return <View style={[styles.base, toneStyles[tone], style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RADII.md,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
});

const toneStyles = StyleSheet.create({
  natural: {
    backgroundColor: SONGA_THEME.surfaceNatural,
  },
  bordered: {
    backgroundColor: SONGA_THEME.surfaceNatural,
    borderWidth: BORDERS.hard,
    borderColor: SONGA_THEME.textDark,
  },
  plain: {
    backgroundColor: SONGA_THEME.background,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.surfaceNatural,
  },
});
