import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card, SongaText } from '@/components/ui';
import type { IsolateResponse } from '@/services/api/schemas';
import { SONGA_THEME, SPACING } from '@/theme';

interface AnalysisCardProps {
  analysis: IsolateResponse | null;
  loading: boolean;
  onClose: () => void;
}

export function AnalysisCard({ analysis, loading, onClose }: AnalysisCardProps) {
  return (
    <Card tone="bordered" style={styles.card}>
      <View style={styles.header}>
        <SongaText variant="title" style={styles.title} numberOfLines={2}>
          {loading ? 'Looking closely…' : analysis?.detected_object}
        </SongaText>
        <Pressable accessibilityRole="button" accessibilityLabel="Close explanation" onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={22} color={SONGA_THEME.textDark} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={SONGA_THEME.primaryAccent} />
          <SongaText variant="caption">Isolating the item and asking Muse Wonder</SongaText>
        </View>
      ) : analysis ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.sections}>
          <SongaText variant="body">{analysis.contextual_description}</SongaText>

          {analysis.price_breakdown ? (
            <View style={styles.section}>
              <SectionLabel icon="pricetag-outline" label="Price" />
              <SongaText variant="body">{analysis.price_breakdown}</SongaText>
            </View>
          ) : null}

          {analysis.safety_precautions.length > 0 ? (
            <View style={styles.section}>
              <SectionLabel icon="warning-outline" label="Heads up" />
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

          <SongaText variant="caption">Answered in {(analysis.latency_ms / 1000).toFixed(1)}s</SongaText>
        </ScrollView>
      ) : null}
    </Card>
  );
}

function SectionLabel({ icon, label }: { icon: 'pricetag-outline' | 'warning-outline'; label: string }) {
  return (
    <View style={styles.sectionLabel}>
      <Ionicons name={icon} size={16} color={SONGA_THEME.primaryAccent} />
      <SongaText variant="label">{label}</SongaText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    maxHeight: 320,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
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
