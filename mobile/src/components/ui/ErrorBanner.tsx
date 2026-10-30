import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { BORDERS, RADII, SONGA_THEME, SPACING } from '@/theme';

import { SongaText } from './SongaText';

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

/** Fallback indicator rendered whenever an external call or device capability fails. */
export function ErrorBanner({ message, onRetry, onDismiss }: ErrorBannerProps) {
  return (
    <View style={styles.root} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={20} color={SONGA_THEME.textDark} />
      <SongaText variant="label" style={styles.message}>
        {message}
      </SongaText>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8}>
          <SongaText variant="label" color="primaryAccent">
            Retry
          </SongaText>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} hitSlop={8}>
          <Ionicons name="close" size={18} color={SONGA_THEME.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: BORDERS.hard,
    borderColor: SONGA_THEME.textDark,
    backgroundColor: SONGA_THEME.background,
  },
  message: {
    flex: 1,
    fontWeight: '500',
  },
});
