import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Card, SongaText } from '@/components/ui';
import { formatClockTime } from '@/lib/dates';
import type { ItineraryEvent } from '@/services/api/schemas';
import { SONGA_THEME, SPACING } from '@/theme';

interface TimelineViewProps {
  summary: string;
  events: readonly ItineraryEvent[];
}

const DOT = 14;
const RAIL = 2;

export function TimelineView({ summary, events }: TimelineViewProps) {
  return (
    <View style={styles.root}>
      <Card>
        <SongaText variant="label">Your day</SongaText>
        <SongaText variant="body">{summary}</SongaText>
      </Card>

      <View>
        {events.map((event, index) => {
          const isLast = index === events.length - 1;
          return (
            <View key={`${event.timestamp}-${index}`} style={styles.row}>
              <View style={styles.timeColumn}>
                <SongaText variant="caption">{formatClockTime(event.timestamp)}</SongaText>
              </View>
              <View style={styles.railColumn}>
                <View style={styles.dot} />
                {!isLast ? <View style={styles.rail} /> : null}
              </View>
              <View style={[styles.content, isLast ? null : styles.contentSpacing]}>
                <SongaText variant="subtitle">{event.activity}</SongaText>
                <View style={styles.location}>
                  <Ionicons name="location-outline" size={14} color={SONGA_THEME.textMuted} />
                  <SongaText variant="caption">{event.location}</SongaText>
                </View>
                {event.notes ? <SongaText variant="body">{event.notes}</SongaText> : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: SPACING.xl,
  },
  row: {
    flexDirection: 'row',
  },
  timeColumn: {
    width: 48,
    paddingTop: SPACING.xxs,
  },
  railColumn: {
    width: DOT,
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: SONGA_THEME.primaryAccent,
    marginTop: SPACING.xxs,
  },
  rail: {
    flex: 1,
    width: RAIL,
    backgroundColor: SONGA_THEME.primaryAccent,
  },
  content: {
    flex: 1,
    gap: SPACING.xs,
  },
  contentSpacing: {
    paddingBottom: SPACING.xl,
  },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xxs,
  },
});
