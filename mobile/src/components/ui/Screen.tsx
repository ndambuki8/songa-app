import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SONGA_THEME, SPACING } from '@/theme';

import { SongaText } from './SongaText';

interface ScreenProps {
  title: string;
  subtitle?: string;
  headerAccessory?: ReactNode;
  scrollable?: boolean;
  children: ReactNode;
}

export function Screen({ title, subtitle, headerAccessory, scrollable = false, children }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const header = (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <SongaText variant="display">{title}</SongaText>
        {subtitle ? <SongaText variant="caption">{subtitle}</SongaText> : null}
      </View>
      {headerAccessory}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + SPACING.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        {header}
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.root, styles.fixedContent, { paddingTop: insets.top + SPACING.lg }]}>
      {header}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SONGA_THEME.background,
  },
  fixedContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  headerText: {
    flex: 1,
    gap: SPACING.xxs,
  },
});
