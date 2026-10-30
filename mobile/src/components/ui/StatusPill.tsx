import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { RADII, SONGA_THEME, SPACING } from '@/theme';

import { SongaText } from './SongaText';

interface StatusPillProps {
  label: string;
  active?: boolean;
  busy?: boolean;
}

export function StatusPill({ label, active = false, busy = false }: StatusPillProps) {
  return (
    <View style={[styles.root, active ? styles.active : styles.passive]}>
      {busy ? (
        <ActivityIndicator size="small" color={active ? SONGA_THEME.background : SONGA_THEME.primaryAccent} />
      ) : (
        <View style={[styles.dot, { backgroundColor: active ? SONGA_THEME.background : SONGA_THEME.primaryAccent }]} />
      )}
      <SongaText variant="caption" style={{ color: active ? SONGA_THEME.background : SONGA_THEME.textDark }}>
        {label}
      </SongaText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.pill,
  },
  active: {
    backgroundColor: SONGA_THEME.primaryAccent,
  },
  passive: {
    backgroundColor: SONGA_THEME.background,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
