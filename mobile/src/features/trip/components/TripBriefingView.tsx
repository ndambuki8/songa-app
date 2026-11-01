import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Card, PrimaryButton, SegmentedControl, SongaText } from '@/components/ui';
import { formatDayLabel } from '@/lib/dates';
import type { TripBriefing } from '@/services/api/schemas';
import { BORDERS, RADII, SONGA_THEME, SPACING } from '@/theme';

type BriefingTab = 'days' | 'phrases' | 'tips';
type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: readonly { value: BriefingTab; label: string }[] = [
  { value: 'days', label: 'Days' },
  { value: 'phrases', label: 'Phrases' },
  { value: 'tips', label: 'Tips' },
];

interface TripBriefingViewProps {
  briefing: TripBriefing;
  travelerLocale: string;
  onSpeakPhrase: (phrase: string) => void;
  onStartOver: () => void;
}

export function TripBriefingView({ briefing, travelerLocale, onSpeakPhrase, onStartOver }: TripBriefingViewProps) {
  const [tab, setTab] = useState<BriefingTab>('days');

  const confirmStartOver = () =>
    Alert.alert('Plan a new trip?', `Your plan for ${briefing.destination} will be removed from this phone.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onStartOver },
    ]);

  return (
    <View style={styles.stack}>
      <Card>
        <SongaText variant="body">{briefing.summary}</SongaText>
      </Card>

      <SegmentedControl options={TABS} value={tab} onChange={setTab} />

      {tab === 'days' ? (
        <View style={styles.list}>
          {briefing.days.map((day, index) => (
            <Card key={day.date} tone="plain">
              <SongaText variant="caption">
                Day {index + 1} · {formatDayLabel(day.date, travelerLocale)}
              </SongaText>
              <SongaText variant="subtitle">{day.title}</SongaText>
              <Bullets items={day.suggestions} />
            </Card>
          ))}
        </View>
      ) : null}

      {tab === 'phrases' ? (
        <View style={styles.list}>
          <SongaText variant="caption">Tap the speaker to hear it, or show the screen.</SongaText>
          {briefing.phrases.map((item) => (
            <View key={item.phrase} style={styles.phrase}>
              <View style={styles.phraseText}>
                <SongaText variant="caption">{item.meaning}</SongaText>
                <SongaText variant="title" selectable>
                  {item.phrase}
                </SongaText>
                {item.pronunciation ? (
                  <SongaText variant="body" color="textMuted">
                    {item.pronunciation}
                  </SongaText>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Say ${item.meaning}`}
                onPress={() => onSpeakPhrase(item.phrase)}
                hitSlop={8}
                style={({ pressed }) => [styles.speak, pressed ? styles.speakPressed : null]}
              >
                <Ionicons name="volume-high" size={22} color={SONGA_THEME.background} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {tab === 'tips' ? (
        <View style={styles.list}>
          {briefing.safety.length > 0 ? (
            <View style={styles.alert} accessibilityRole="alert">
              <SectionTitle icon="warning" title="Stay safe" />
              <Bullets items={briefing.safety} />
            </View>
          ) : null}
          <TipSection icon="people-outline" title="Good manners" items={briefing.etiquette} />
          <TipSection icon="cash-outline" title="Money" items={briefing.money} />
          <TipSection icon="train-outline" title="Getting around" items={briefing.getting_around} />
          {briefing.emergency_numbers.length > 0 ? (
            <Card tone="bordered">
              <SectionTitle icon="call-outline" title="Emergency numbers" />
              {briefing.emergency_numbers.map((entry) => (
                <Pressable
                  key={`${entry.label}-${entry.number}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${entry.label}, ${entry.number}`}
                  onPress={() => void Linking.openURL(`tel:${entry.number.replace(/[^\d+]/g, '')}`)}
                  style={styles.emergency}
                >
                  <SongaText variant="body" style={styles.emergencyLabel}>
                    {entry.label}
                  </SongaText>
                  <SongaText variant="title" color="primaryAccent">
                    {entry.number}
                  </SongaText>
                </Pressable>
              ))}
              <SongaText variant="caption">Confirm these with your stay when you arrive.</SongaText>
            </Card>
          ) : null}
        </View>
      ) : null}

      <PrimaryButton label="Plan a new trip" icon="refresh" variant="outline" onPress={confirmStartOver} />
    </View>
  );
}

function TipSection({ icon, title, items }: { icon: IconName; title: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <Card tone="plain">
      <SectionTitle icon={icon} title={title} />
      <Bullets items={items} />
    </Card>
  );
}

function SectionTitle({ icon, title }: { icon: IconName; title: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Ionicons name={icon} size={18} color={SONGA_THEME.primaryAccent} />
      <SongaText variant="subtitle">{title}</SongaText>
    </View>
  );
}

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <View style={styles.bullets}>
      {items.map((item) => (
        <View key={item} style={styles.bullet}>
          <SongaText variant="body">•</SongaText>
          <SongaText variant="body" style={styles.bulletText}>
            {item}
          </SongaText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: SPACING.lg,
  },
  list: {
    gap: SPACING.md,
  },
  phrase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADII.md,
    backgroundColor: SONGA_THEME.surfaceNatural,
  },
  phraseText: {
    flex: 1,
    gap: SPACING.xxs,
  },
  speak: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SONGA_THEME.primaryAccent,
  },
  speakPressed: {
    backgroundColor: SONGA_THEME.secondaryAccent,
  },
  alert: {
    gap: SPACING.sm,
    padding: SPACING.lg,
    borderRadius: RADII.md,
    borderWidth: BORDERS.hard,
    borderColor: SONGA_THEME.primaryAccent,
    backgroundColor: SONGA_THEME.background,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  bullets: {
    gap: SPACING.xs,
  },
  bullet: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  bulletText: {
    flex: 1,
  },
  emergency: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  emergencyLabel: {
    flex: 1,
  },
});
