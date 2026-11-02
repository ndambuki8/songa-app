import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card, PrimaryButton, SongaText } from '@/components/ui';
import type { MenuCheckResponse } from '@/services/api/schemas';
import { BORDERS, RADII, SONGA_THEME, SPACING } from '@/theme';

import { VERDICT_STYLE } from './verdictStyle';

interface MenuCheckCardProps {
  result: MenuCheckResponse | null;
  loading: boolean;
  selectedSegmentId: string | null;
  onSelectDish: (segmentId: string | null) => void;
  onReadAloud: () => void;
  onAskStaff: () => void;
}

export function MenuCheckCard({ result, loading, selectedSegmentId, onSelectDish, onReadAloud, onAskStaff }: MenuCheckCardProps) {
  return (
    <Card tone="bordered" style={styles.card}>
      <View style={styles.header}>
        <SongaText variant="title" style={styles.title}>
          {loading ? 'Checking each dish…' : 'Food check'}
        </SongaText>
        {result && !loading ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Read summary aloud" onPress={onReadAloud} hitSlop={10}>
            <Ionicons name="volume-high-outline" size={24} color={SONGA_THEME.primaryAccent} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={SONGA_THEME.primaryAccent} />
          <SongaText variant="caption">Reading the menu against your food needs</SongaText>
        </View>
      ) : result ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.sections}>
          <SongaText variant="body">{result.spoken_summary}</SongaText>

          {result.dishes.map((dish, index) => {
            const style = VERDICT_STYLE[dish.verdict];
            const selected = dish.segment_id !== null && dish.segment_id === selectedSegmentId;
            return (
              <Pressable
                key={`${dish.name}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`${style.label}: ${dish.name}. ${dish.reason}`}
                accessibilityState={{ selected, disabled: dish.segment_id === null }}
                disabled={dish.segment_id === null}
                onPress={() => onSelectDish(dish.segment_id)}
                style={[styles.dish, selected ? styles.dishSelected : null]}
              >
                <Ionicons name={style.icon} size={24} color={SONGA_THEME[style.color]} />
                <View style={styles.dishText}>
                  <SongaText variant="subtitle">{dish.name}</SongaText>
                  <SongaText variant="caption">
                    {style.label} · {dish.reason}
                  </SongaText>
                </View>
              </Pressable>
            );
          })}

          {result.staff_question ? (
            <View style={styles.staff}>
              <SongaText variant="label">Ask staff</SongaText>
              <SongaText variant="subtitle">{result.staff_question}</SongaText>
              {result.staff_question_meaning ? <SongaText variant="caption">{result.staff_question_meaning}</SongaText> : null}
              <PrimaryButton label="Play it for them" icon="volume-high" compact onPress={onAskStaff} />
            </View>
          ) : null}

          <SongaText variant="caption" color="textMuted">
            Songa can be wrong. Always confirm with staff for serious allergies.
          </SongaText>
        </ScrollView>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    maxHeight: 380,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  title: {
    flex: 1,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  scroll: {
    flexGrow: 0,
  },
  sections: {
    gap: SPACING.md,
  },
  staff: {
    gap: SPACING.xs,
    alignItems: 'flex-start',
    padding: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: BORDERS.hard,
    borderColor: SONGA_THEME.primaryAccent,
    backgroundColor: SONGA_THEME.background,
  },
  dish: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: BORDERS.hard,
    borderColor: 'transparent',
  },
  dishSelected: {
    borderColor: SONGA_THEME.textDark,
    backgroundColor: SONGA_THEME.background,
  },
  dishText: {
    flex: 1,
  },
});
