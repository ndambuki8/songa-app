import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { LanguagePicker, PrimaryButton, SongaText, StatusPill } from '@/components/ui';
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
  /** Rotates the zone 180deg and switches to the green surface for the person facing the traveler. */
  resident?: boolean;
  review?: { onConfirm: () => void; onRetry: () => void } | null;
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
  resident = false,
  review = null,
}: DialogueZoneProps) {
  const [showNote, setShowNote] = useState(false);
  const textColor = resident ? 'background' : undefined;

  return (
    <View style={[styles.zone, resident ? styles.resident : null]}>
      <View style={styles.topRow}>
        <LanguagePicker caption={languageCaption} locale={locale} onChange={onLocaleChange} />
        {statusLabel ? <StatusPill label={statusLabel} active={recording} busy={processing} /> : null}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <SongaText variant="caption" color={textColor}>
          {content.caption}
        </SongaText>
        <SongaText variant="display" color={textColor} selectable>
          {content.headline}
        </SongaText>
        {content.detail ? (
          <SongaText variant="body" color={resident ? 'background' : 'textMuted'}>
            {content.detail}
          </SongaText>
        ) : null}
        {content.note ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showNote }}
            onPress={() => setShowNote((value) => !value)}
            style={styles.noteToggle}
            hitSlop={8}
          >
            <Ionicons name={showNote ? 'chevron-up' : 'information-circle-outline'} size={16} color={SONGA_THEME.primaryAccent} />
            <SongaText variant="label" color="primaryAccent">
              Why it is phrased this way
            </SongaText>
          </Pressable>
        ) : null}
        {content.note && showNote ? <SongaText variant="body">{content.note}</SongaText> : null}
      </ScrollView>

      {review ? (
        <View style={styles.reviewRow}>
          <View style={styles.reviewButton}>
            <PrimaryButton label="Try again" icon="refresh" variant="outline" onPress={review.onRetry} />
          </View>
          <View style={styles.reviewButton}>
            <PrimaryButton label="Say it" icon="volume-high" onPress={review.onConfirm} />
          </View>
        </View>
      ) : (
        <View style={styles.micRow}>
          <MicButton
            inverse={resident}
            recording={recording}
            processing={processing}
            disabled={micDisabled}
            onPress={onMicPress}
            accessibilityLabel={recording ? 'Stop recording and translate' : `Record in ${languageCaption}`}
          />
        </View>
      )}
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
  resident: {
    backgroundColor: SONGA_THEME.primaryAccent,
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
  noteToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  micRow: {
    alignItems: 'center',
  },
  reviewRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  reviewButton: {
    flex: 1,
  },
});
