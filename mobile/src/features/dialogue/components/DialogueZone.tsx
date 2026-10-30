import { ScrollView, StyleSheet, View } from 'react-native';

import { LanguagePicker, SongaText, StatusPill } from '@/components/ui';
import { RADII, SONGA_THEME, SPACING } from '@/theme';

import type { ZoneContent } from '../zoneContent';
import { MicButton } from './MicButton';

interface DialogueZoneProps {
  content: ZoneContent;
  languageCaption: string;
  locale: string;
  onLocaleChange: (locale: string) => void;
  statusLabel: string | null;
  recording: boolean;
  processing: boolean;
  micDisabled: boolean;
  onMicPress: () => void;
  /** Rotates the zone 180deg so a person facing the traveler can read it. */
  inverted?: boolean;
}

export function DialogueZone({
  content,
  languageCaption,
  locale,
  onLocaleChange,
  statusLabel,
  recording,
  processing,
  micDisabled,
  onMicPress,
  inverted = false,
}: DialogueZoneProps) {
  return (
    <View style={[styles.zone, inverted ? styles.inverted : null]}>
      <View style={styles.topRow}>
        <LanguagePicker caption={languageCaption} locale={locale} onChange={onLocaleChange} />
        {statusLabel ? <StatusPill label={statusLabel} active={recording} busy={processing} /> : null}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <SongaText variant="caption">{content.caption}</SongaText>
        <SongaText variant="display" selectable>
          {content.headline}
        </SongaText>
        {content.detail ? <SongaText variant="caption">{content.detail}</SongaText> : null}
      </ScrollView>

      <View style={styles.micRow}>
        <MicButton
          recording={recording}
          processing={processing}
          disabled={micDisabled}
          onPress={onMicPress}
          accessibilityLabel={recording ? 'Stop recording and translate' : `Record in ${languageCaption}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    flex: 1,
    backgroundColor: SONGA_THEME.surfaceNatural,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  inverted: {
    transform: [{ rotate: '180deg' }],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    gap: SPACING.xs,
  },
  micRow: {
    alignItems: 'center',
  },
});
