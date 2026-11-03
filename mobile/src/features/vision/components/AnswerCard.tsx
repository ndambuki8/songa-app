import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, type ComponentRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card, SongaText } from '@/components/ui';
import { BORDERS, RADII, SONGA_THEME, SPACING } from '@/theme';

import type { ThreadTurn } from '../hooks/useVisualInterpreter';
import { AnswerBody } from './AnswerBody';

interface AnswerCardProps {
  thread: readonly ThreadTurn[];
  highlightCount: number;
  /** Where the photo was taken, shown so the traveler knows answers use it. */
  placeLabel: string | null;
  onClose: () => void;
  onStartOver: () => void;
}

/** The conversation about the current photo: every question and answer, newest at the bottom. */
export function AnswerCard({ thread, highlightCount, placeLabel, onClose, onStartOver }: AnswerCardProps) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const asked = thread.filter((turn) => turn.kind === 'ask').length;
  const latest = thread[thread.length - 1];

  return (
    <Card tone="bordered" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <SongaText variant="label">About this photo</SongaText>
          {placeLabel ? (
            <View style={styles.place}>
              <Ionicons name="location-outline" size={12} color={SONGA_THEME.textMuted} />
              <SongaText variant="caption" numberOfLines={1} style={styles.flex}>
                {placeLabel}
              </SongaText>
            </View>
          ) : null}
        </View>
        {asked > 1 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Start a new conversation" onPress={onStartOver} hitSlop={10}>
            <SongaText variant="label" color="primaryAccent">
              Start over
            </SongaText>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Hide conversation" onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={22} color={SONGA_THEME.textDark} />
        </Pressable>
      </View>

      <ScrollView
        ref={scroll}
        style={styles.scroll}
        contentContainerStyle={styles.body}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {thread.map((turn) =>
          turn.kind === 'explain' ? (
            <View key={turn.id} style={styles.explain}>
              <Ionicons name="hand-left-outline" size={14} color={SONGA_THEME.textMuted} />
              <SongaText variant="caption" style={styles.flex} numberOfLines={2}>
                You tapped {turn.title}
              </SongaText>
            </View>
          ) : (
            <View key={turn.id} style={styles.turn}>
              <View style={styles.question}>
                <SongaText variant="body">{turn.question}</SongaText>
              </View>
              {turn.answer === null ? (
                <View style={styles.row}>
                  <ActivityIndicator color={SONGA_THEME.primaryAccent} />
                  <SongaText variant="caption">Thinking…</SongaText>
                </View>
              ) : (
                <AnswerBody title={turn.title} answer={turn.answer} points={turn.points} alerts={turn.alerts} />
              )}
            </View>
          ),
        )}

        {latest?.kind === 'ask' && latest.answer !== null ? (
          latest.highlightsPending ? (
            <View style={styles.row}>
              <ActivityIndicator size="small" color={SONGA_THEME.primaryAccent} />
              <SongaText variant="caption">Finding them on the photo…</SongaText>
            </View>
          ) : (
            <SongaText variant="caption">
              {highlightCount > 0 ? `Highlighted ${highlightCount === 1 ? '1 match' : `${highlightCount} matches`}. ` : ''}
              {latest.latencyMs !== null ? `Answered in ${(latest.latencyMs / 1000).toFixed(1)}s` : ''}
            </SongaText>
          )
        ) : null}
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  // A list of options needs room; the photo above shrinks to make it.
  card: {
    maxHeight: 420,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  flex: {
    flex: 1,
  },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xxs,
  },
  scroll: {
    flexGrow: 0,
  },
  body: {
    gap: SPACING.md,
    paddingTop: SPACING.xs,
  },
  turn: {
    gap: SPACING.sm,
  },
  question: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.md,
    backgroundColor: SONGA_THEME.background,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
  },
  explain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
});
