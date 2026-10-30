import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { BORDERS, RADII, SONGA_THEME, SPACING } from '@/theme';

import { SongaText } from './SongaText';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'solid' | 'outline';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  accessibilityHint?: string;
}

export function PrimaryButton({
  label,
  onPress,
  variant = 'solid',
  icon,
  loading = false,
  disabled = false,
  compact = false,
  accessibilityHint,
}: PrimaryButtonProps) {
  const isSolid = variant === 'solid';
  const foreground = isSolid ? SONGA_THEME.background : SONGA_THEME.textDark;
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact ? styles.compact : styles.regular,
        isSolid
          ? { backgroundColor: pressed ? SONGA_THEME.secondaryAccent : SONGA_THEME.primaryAccent }
          : {
              backgroundColor: pressed ? SONGA_THEME.surfaceNatural : SONGA_THEME.background,
              borderColor: SONGA_THEME.textDark,
              borderWidth: BORDERS.hard,
            },
        inactive ? styles.inactive : null,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={foreground} size="small" />
        ) : icon ? (
          <Ionicons name={icon} size={compact ? 16 : 18} color={foreground} />
        ) : null}
        <SongaText variant="label" style={{ color: foreground }}>
          {label}
        </SongaText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RADII.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  regular: {
    minHeight: 48,
    paddingHorizontal: SPACING.xl,
  },
  compact: {
    minHeight: 36,
    paddingHorizontal: SPACING.lg,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  inactive: {
    opacity: 0.5,
  },
});
