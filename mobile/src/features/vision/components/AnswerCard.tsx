import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card, SongaText } from '@/components/ui';
import { SONGA_THEME, SPACING } from '@/theme';

import type { PhotoAnswer } from '../hooks/useVisualInterpreter';

interface AnswerCardProps {
  answer: PhotoAnswer | null;
  loading: boolean;
  highlightCount: number;
  onClose: () => void;
}

export function AnswerCard({ answer, loading, highlightCount, onClose }: AnswerCardProps) {
  return (
    <Card tone="bordered" style={styles.card}>
      <View style={styles.header}>
        <SongaText variant="title" style={styles.title} numberOfLines={2}>
          {loading || !answer ? 'Thinking…' : answer.title}
        </SongaText>
        <Pressable accessibilityRole="button" accessibilityLabel="Close answer" onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={22} color={SONGA_THEME.textDark} />
        </Pressable>
      </View>

      {loading || !answer ? (
        <View style={styles.row}>
          <ActivityIndicator color={SONGA_THEME.primaryAccent} />
          <SongaText variant="caption">Reading the photo and what is around you</SongaText>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          <SongaText variant="caption">“{answer.question}”</SongaText>
          <SongaText variant="body" selectable>
            {answer.answer}
          </SongaText>
          {answer.highlightsPending ? (
            <View style={styles.row}>
              <ActivityIndicator size="small" color={SONGA_THEME.primaryAccent} />
              <SongaText variant="caption">Finding them on the photo…</SongaText>
            </View>
          ) : highlightCount > 0 ? (
            <SongaText variant="caption">
              Highlighted {highlightCount === 1 ? '1 match' : `${highlightCount} matches`} on the photo.
            </SongaText>
          ) : null}
          <SongaText variant="caption">Answered in {(answer.latencyMs / 1000).toFixed(1)}s</SongaText>
        </ScrollView>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    maxHeight: 300,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  title: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  scroll: {
    flexGrow: 0,
  },
  body: {
    gap: SPACING.sm,
  },
});
