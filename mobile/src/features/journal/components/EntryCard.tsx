import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { SongaText } from '@/components/ui';
import { formatClockTime } from '@/lib/dates';
import { BORDERS, RADII, SONGA_THEME, SPACING } from '@/theme';

import type { LogbookEntry } from '../logbookStore';

const KIND_ICONS = {
  text: 'create-outline',
  voice: 'mic-outline',
  photo: 'image-outline',
} as const;

interface EntryCardProps {
  entry: LogbookEntry;
  onRemove: () => void;
  onRetryTranscription: () => void;
}

export function EntryCard({ entry, onRemove, onRetryTranscription }: EntryCardProps) {
  return (
    <View style={styles.root}>
      <View style={styles.meta}>
        <Ionicons name={KIND_ICONS[entry.kind]} size={16} color={SONGA_THEME.primaryAccent} />
        <SongaText variant="caption">{formatClockTime(entry.capturedAt)}</SongaText>
        {entry.latitude !== null ? <Ionicons name="location-outline" size={12} color={SONGA_THEME.textMuted} /> : null}
        <View style={styles.spacer} />
        <Pressable accessibilityRole="button" accessibilityLabel="Delete entry" onPress={onRemove} hitSlop={10}>
          <Ionicons name="trash-outline" size={16} color={SONGA_THEME.textMuted} />
        </Pressable>
      </View>

      {entry.kind === 'photo' && entry.mediaUri ? (
        <Image source={{ uri: entry.mediaUri }} style={styles.photo} resizeMode="cover" accessibilityLabel="Journal photo" />
      ) : null}

      {entry.text ? <SongaText variant="body">{entry.text}</SongaText> : null}

      {entry.kind === 'voice' && entry.transcription === 'pending' ? (
        <View style={styles.inline}>
          <ActivityIndicator size="small" color={SONGA_THEME.primaryAccent} />
          <SongaText variant="caption">Transcribing…</SongaText>
        </View>
      ) : null}

      {entry.kind === 'voice' && entry.transcription === 'done' && !entry.text?.trim() ? (
        <SongaText variant="caption">No speech was heard in this memo.</SongaText>
      ) : null}

      {entry.kind === 'voice' && entry.transcription === 'failed' ? (
        <Pressable accessibilityRole="button" onPress={onRetryTranscription} style={styles.inline}>
          <Ionicons name="refresh" size={14} color={SONGA_THEME.primaryAccent} />
          <SongaText variant="label" color="primaryAccent">
            Retry transcription
          </SongaText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    padding: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.surfaceNatural,
    backgroundColor: SONGA_THEME.background,
    gap: SPACING.sm,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  spacer: {
    flex: 1,
  },
  photo: {
    width: '100%',
    height: 160,
    borderRadius: RADII.sm,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
});
