import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBanner, SongaText } from '@/components/ui';
import { SONGA_THEME, SPACING } from '@/theme';

import type { ApiLoadingState, Speaker, useDialogueBridge } from '../hooks/useDialogueBridge';
import { selectZoneContent } from '../zoneContent';
import { DialogueZone } from './DialogueZone';

const STATUS_LABELS: Record<ApiLoadingState, string | null> = {
  idle: null,
  recording: 'Listening',
  processing: 'Interpreting',
  speaking: 'Speaking',
};

interface DialogueBridgeViewProps {
  bridge: ReturnType<typeof useDialogueBridge>;
}

export function DialogueBridgeView({ bridge }: DialogueBridgeViewProps) {
  const insets = useSafeAreaInsets();
  const busy = bridge.apiLoadingState === 'processing';

  const zoneProps = (zone: Speaker) => {
    const isActive = bridge.activeSpeaker === zone;
    const otherIsRecording = bridge.apiLoadingState === 'recording' && !isActive;
    return {
      content: selectZoneContent(bridge.lastTurn, zone),
      statusLabel: isActive || bridge.apiLoadingState === 'speaking' ? STATUS_LABELS[bridge.apiLoadingState] : null,
      recording: isActive && bridge.apiLoadingState === 'recording',
      processing: isActive && busy,
      micDisabled: busy || otherIsRecording,
      onMicPress: () => bridge.toggleRecording(zone),
    };
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + SPACING.sm }]}>
      <DialogueZone
        {...zoneProps('resident')}
        inverted
        languageCaption="They speak"
        locale={bridge.residentLocale}
        onLocaleChange={bridge.setResidentLocale}
      />

      <View style={styles.divider}>
        <SongaText variant="label" color="textMuted">
          Songa
        </SongaText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Replay last translation"
          disabled={!bridge.lastTurn}
          onPress={bridge.replay}
          hitSlop={10}
          style={!bridge.lastTurn ? styles.hidden : null}
        >
          <Ionicons name="volume-high" size={22} color={SONGA_THEME.primaryAccent} />
        </Pressable>
      </View>

      {bridge.error ? <ErrorBanner message={bridge.error} onDismiss={bridge.dismissError} /> : null}

      <DialogueZone
        {...zoneProps('traveler')}
        languageCaption="You speak"
        locale={bridge.travelerLocale}
        onLocaleChange={bridge.setTravelerLocale}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SONGA_THEME.background,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    gap: SPACING.sm,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm,
  },
  hidden: {
    opacity: 0,
  },
});
