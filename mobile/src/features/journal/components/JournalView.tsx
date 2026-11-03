import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import { ErrorBanner, PrimaryButton, Screen, SegmentedControl, SongaText } from '@/components/ui';
import { SONGA_THEME, SPACING } from '@/theme';

import type { Logbook } from '../hooks/useLogbook';
import { CaptureBar } from './CaptureBar';
import { EntryCard } from './EntryCard';
import { TimelineView } from './TimelineView';

type JournalTab = 'moments' | 'itinerary';

const TABS: readonly { value: JournalTab; label: string }[] = [
  { value: 'moments', label: 'Moments' },
  { value: 'itinerary', label: 'Itinerary' },
];

interface JournalViewProps {
  logbook: Logbook;
}

export function JournalView({ logbook }: JournalViewProps) {
  const [tab, setTab] = useState<JournalTab>('moments');

  const compile = () => {
    setTab('itinerary');
    void logbook.compileDay();
  };

  const confirmDiscard = () =>
    Alert.alert('Remove this itinerary?', 'Your moments stay saved. You can put the day together again later.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: logbook.discardItinerary },
    ]);

  return (
    <Screen title="Journal" subtitle={`Today · ${logbook.today}`} scrollable>
      <View style={styles.stack}>
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />

        {logbook.error ? <ErrorBanner message={logbook.error} onDismiss={logbook.dismissError} /> : null}

        {tab === 'moments' ? (
          <>
            <CaptureBar
              recording={logbook.isRecordingMemo}
              recordingDurationMs={logbook.memoDurationMs}
              onSubmitNote={(text) => void logbook.addNote(text)}
              onToggleMemo={() => void logbook.toggleVoiceMemo()}
              onTakePhoto={() => void logbook.addPhoto('camera')}
              onPickPhoto={() => void logbook.addPhoto('library')}
            />

            {!logbook.loaded ? (
              <ActivityIndicator color={SONGA_THEME.primaryAccent} />
            ) : logbook.entries.length === 0 ? (
              <EmptyState
                icon="sparkles-outline"
                title="Capture the day as it happens"
                body="Notes, voice memos and photos of tickets or brochures. Songa turns them into a clean itinerary tonight."
              />
            ) : (
              <View style={styles.list}>
                {logbook.entries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    onRemove={() => logbook.removeEntry(entry.id)}
                    onRetryTranscription={() => logbook.retryTranscription(entry.id)}
                  />
                ))}
              </View>
            )}

            <PrimaryButton
              label={logbook.itinerary ? 'Update my day' : 'Put my day together'}
              icon="sparkles-outline"
              loading={logbook.compiling}
              disabled={logbook.entries.length === 0}
              onPress={compile}
            />
          </>
        ) : logbook.compiling ? (
          <View style={styles.compiling}>
            <ActivityIndicator color={SONGA_THEME.primaryAccent} size="large" />
            <SongaText variant="label">Putting your day in order…</SongaText>
          </View>
        ) : logbook.itinerary ? (
          <>
            <TimelineView summary={logbook.itinerary.summary} events={logbook.itinerary.events} />
            <PrimaryButton label="Add more moments" icon="add" onPress={() => setTab('moments')} />
            <PrimaryButton label="Start over" variant="outline" icon="trash-outline" onPress={confirmDiscard} />
          </>
        ) : (
          <EmptyState
            icon="map-outline"
            title="No itinerary yet"
            body="Capture a few moments, then tap Put my day together."
          />
        )}
      </View>
    </Screen>
  );
}

function EmptyState({ icon, title, body }: { icon: 'sparkles-outline' | 'map-outline'; title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={32} color={SONGA_THEME.primaryAccent} />
      <SongaText variant="subtitle" align="center">
        {title}
      </SongaText>
      <SongaText variant="body" color="textMuted" align="center">
        {body}
      </SongaText>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: SPACING.lg,
  },
  list: {
    gap: SPACING.sm,
  },
  empty: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  compiling: {
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.xxxl,
  },
});
