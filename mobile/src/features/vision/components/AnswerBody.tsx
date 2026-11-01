import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { SongaText } from '@/components/ui';
import type { AskPoint } from '@/services/api/schemas';
import { BORDERS, RADII, SONGA_THEME, SPACING } from '@/theme';

interface AnswerBodyProps {
  title: string | null;
  answer: string;
  /** Optional so answers kept in memory from an older app version (or a hot reload) still render. */
  points?: readonly AskPoint[];
  alerts?: readonly string[];
}

/**
 * One answer laid out for a phone: heading, short summary, warnings that must not be missed, then the options
 * as a numbered list with prices aligned on the right.
 */
export function AnswerBody({ title, answer, points = [], alerts = [] }: AnswerBodyProps) {
  return (
    <View style={styles.root}>
      {title ? <SongaText variant="subtitle">{title}</SongaText> : null}

      {alerts.length > 0 ? (
        <View style={styles.alerts} accessibilityRole="alert">
          {alerts.map((alert) => (
            <View key={alert} style={styles.alertRow}>
              <Ionicons name="warning-outline" size={16} color={SONGA_THEME.textDark} style={styles.alertIcon} />
              <SongaText variant="label" style={styles.flex}>
                {alert}
              </SongaText>
            </View>
          ))}
        </View>
      ) : null}

      <SongaText variant="body" selectable>
        {answer}
      </SongaText>

      {points.length > 0 ? (
        <View style={styles.points}>
          {points.map((point, index) => (
            <View key={`${index}-${point.label}`} style={[styles.point, index > 0 ? styles.pointDivider : null]}>
              <View style={styles.badge}>
                <SongaText variant="label" style={styles.badgeText}>
                  {index + 1}
                </SongaText>
              </View>
              <View style={styles.pointBody}>
                <View style={styles.pointHeader}>
                  <SongaText variant="label" style={styles.flex} selectable>
                    {point.label}
                  </SongaText>
                  {point.price ? (
                    <SongaText variant="label" color="primaryAccent" style={styles.price} selectable>
                      {point.price}
                    </SongaText>
                  ) : null}
                </View>
                {point.text ? (
                  <SongaText variant="caption" style={styles.pointText} selectable>
                    {point.text}
                  </SongaText>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const BADGE = 22;

const styles = StyleSheet.create({
  root: {
    gap: SPACING.sm,
  },
  flex: {
    flex: 1,
  },
  alerts: {
    gap: SPACING.xs,
    padding: SPACING.sm,
    borderRadius: RADII.sm,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
    backgroundColor: SONGA_THEME.background,
  },
  alertRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  alertIcon: {
    marginTop: 1,
  },
  points: {
    borderRadius: RADII.sm,
    backgroundColor: SONGA_THEME.background,
    paddingHorizontal: SPACING.sm,
  },
  point: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  pointDivider: {
    borderTopWidth: BORDERS.hairline,
    borderTopColor: SONGA_THEME.surfaceNatural,
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SONGA_THEME.primaryAccent,
  },
  badgeText: {
    color: SONGA_THEME.background,
    fontSize: 12,
    lineHeight: 14,
  },
  pointBody: {
    flex: 1,
    gap: SPACING.xxs,
  },
  pointHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  price: {
    textAlign: 'right',
    maxWidth: '45%',
  },
  pointText: {
    color: SONGA_THEME.textDark,
  },
});
