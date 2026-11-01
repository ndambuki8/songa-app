import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card, SongaText } from '@/components/ui';
import type { IsolateResponse } from '@/services/api/schemas';
import { BORDERS, RADII, SONGA_THEME, SPACING } from '@/theme';

interface AnalysisCardProps {
  analysis: IsolateResponse | null;
  loading: boolean;
  onClose: () => void;
  onReadAloud: () => void;
}

export function AnalysisCard({ analysis, loading, onClose, onReadAloud }: AnalysisCardProps) {
  return (
    <Card tone="bordered" style={styles.card}>
      <View style={styles.header}>
        <SongaText variant="title" style={styles.title} numberOfLines={2}>
          {loading ? 'Reading this one…' : analysis?.detected_object}
        </SongaText>
        {analysis && !loading ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Read aloud" onPress={onReadAloud} hitSlop={10}>
            <Ionicons name="volume-high-outline" size={24} color={SONGA_THEME.primaryAccent} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Close explanation" onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={24} color={SONGA_THEME.textDark} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={SONGA_THEME.primaryAccent} />
          <SongaText variant="caption">Translating and checking for anything to watch out for</SongaText>
        </View>
      ) : analysis ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.sections}>
          {analysis.safety_precautions.length > 0 ? (
            <View style={styles.alerts} accessibilityRole="alert">
              <SectionLabel icon="warning" label="Heads up" />
              {analysis.safety_precautions.map((item) => (
                <View key={item} style={styles.bullet}>
                  <SongaText variant="body">•</SongaText>
                  <SongaText variant="body" style={styles.bulletText}>
                    {item}
                  </SongaText>
                </View>
              ))}
            </View>
          ) : null}

          {analysis.price_breakdown ? (
            <View style={styles.section}>
              <SectionLabel icon="pricetag-outline" label="Price" />
              <SongaText variant="subtitle">{analysis.price_breakdown}</SongaText>
            </View>
          ) : null}

          <SongaText variant="body">{analysis.contextual_description}</SongaText>
        </ScrollView>
      ) : null}
    </Card>
  );
}

function SectionLabel({ icon, label }: { icon: 'pricetag-outline' | 'warning'; label: string }) {
  return (
    <View style={styles.sectionLabel}>
      <Ionicons name={icon} size={16} color={SONGA_THEME.primaryAccent} />
      <SongaText variant="label">{label}</SongaText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    maxHeight: 360,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  alerts: {
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: BORDERS.hard,
    borderColor: SONGA_THEME.primaryAccent,
    backgroundColor: SONGA_THEME.background,
  },
  section: {
    gap: SPACING.xs,
  },
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  bullet: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  bulletText: {
    flex: 1,
  },
});
