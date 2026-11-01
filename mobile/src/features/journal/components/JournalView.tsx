import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Card, ErrorBanner, PrimaryButton, Screen, SegmentedControl, SongaText } from '@/components/ui';
import { formatClockTime, formatDayHeading } from '@/lib/dates';
import { SONGA_THEME, SPACING } from '@/theme';

import { MAX_PHOTOS_PER_DAY, type Logbook } from '../hooks/useLogbook';
import { CaptureBar } from './CaptureBar';
import { EntryCard } from './EntryCard';
import { TimelineView } from './TimelineView';

type JournalTab = 'moments' | 'day';

interface JournalViewProps {
  logbook: Logbook;
  /** The Journal tab is on screen; "My day" only writes itself up while visible. */
  focused: boolean;
}

export function JournalView({ logbook, focused }: JournalViewProps) {
  const [tab, setTab] = useState<JournalTab>('moments');
  const { setDayVisible } = logbook;

  useEffect(() => {
    setDayVisible(focused && tab === 'day');
  }, [focused, setDayVisible, tab]);

  const tabs: readonly { value: JournalTab; label: string }[] = [
    { value: 'moments', label: logbook.entries.length > 0 ? `Moments · ${logbook.entries.length}` : 'Moments' },
    { value: 'day', label: 'My day' },
  ];

  return (
    <Screen title="Journal" subtitle={formatDayHeading(logbook.today)} scrollable>
      <View style={styles.stack}>
        <SegmentedControl options={tabs} value={tab} onChange={setTab} />

        {logbook.error ? <ErrorBanner message={logbook.error} onDismiss={logbook.dismissError} /> : null}

        {tab === 'moments' ? (
          <MomentsPanel logbook={logbook} onSeeDay={() => setTab('day')} />
        ) : (
          <DayPanel logbook={logbook} onAddMoments={() => setTab('moments')} />
        )}
      </View>
    </Screen>
  );
}

function MomentsPanel({ logbook, onSeeDay }: { logbook: Logbook; onSeeDay: () => void }) {
  return (
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
          body="Jot a note, record a voice memo, or snap a ticket, a meal or a view. Songa writes it up as your day, in your own words."
        />
      ) : (
        <>
          {logbook.momentCount > 0 ? (
            <PrimaryButton
              label={logbook.dayStatus === 'current' ? 'See my day' : 'Write up my day'}
              icon="book-outline"
              onPress={onSeeDay}
            />
          ) : null}
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
        </>
      )}
    </>
  );
}

function DayPanel({ logbook, onAddMoments }: { logbook: Logbook; onAddMoments: () => void }) {
  const { itinerary, dayStatus, compiling } = logbook;

  if (dayStatus === 'empty') {
    return (
      <>
        <EmptyState
          icon="book-outline"
          title="Your day writes itself"
          body="Add a few moments and Songa turns them into a timeline of your day, written in your voice."
        />
        <PrimaryButton label="Add a moment" icon="add" variant="outline" onPress={onAddMoments} />
        {logbook.memosWaiting > 0 ? <WaitingMemos count={logbook.memosWaiting} /> : null}
      </>
    );
  }

  if (!itinerary) {
    return compiling ? (
      <View style={styles.writing}>
        <ActivityIndicator color={SONGA_THEME.primaryAccent} size="large" />
        <SongaText variant="label">Writing up your day…</SongaText>
        <SongaText variant="caption" align="center">
          From {pluralize(logbook.momentCount, 'moment')}. This takes a few seconds.
        </SongaText>
      </View>
    ) : (
      <>
        <EmptyState
          icon="book-outline"
          title="Ready to write up"
          body={`${pluralize(logbook.momentCount, 'moment')} captured today.`}
        />
        <PrimaryButton label="Write up my day" icon="book-outline" onPress={() => void logbook.writeDay()} />
      </>
    );
  }

  return (
    <>
      {compiling ? (
        <StatusRow icon={null} text="Updating with your latest moments…" />
      ) : dayStatus === 'outdated' ? (
        <Card style={styles.outdated}>
          <SongaText variant="body" style={styles.flex}>
            {logbook.newMomentCount > 0
              ? `${pluralize(logbook.newMomentCount, 'new moment')} since this was written.`
              : 'Your moments changed since this was written.'}
          </SongaText>
          <PrimaryButton label="Update" icon="refresh" compact onPress={() => void logbook.writeDay()} />
        </Card>
      ) : null}

      <View style={compiling ? styles.dimmed : null}>
        <TimelineView summary={itinerary.summary} events={itinerary.events} toDo={itinerary.to_do} />
      </View>

      <View style={styles.footer}>
        {logbook.memosWaiting > 0 ? <WaitingMemos count={logbook.memosWaiting} /> : null}
        {logbook.photosLeftOut > 0 ? (
          <StatusRow icon="images-outline" text={`Only your latest ${MAX_PHOTOS_PER_DAY} photos are used.`} />
        ) : null}
        <View style={styles.footerRow}>
          <SongaText variant="caption" style={styles.flex}>
            Written from {pluralize(itinerary.sourceIds?.length ?? logbook.momentCount, 'moment')} at{' '}
            {formatClockTime(itinerary.compiledAt)}
          </SongaText>
          {!compiling && dayStatus === 'current' ? (
            <Pressable accessibilityRole="button" onPress={() => void logbook.writeDay()} hitSlop={10}>
              <SongaText variant="label" color="primaryAccent">
                Rewrite
              </SongaText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </>
  );
}

function WaitingMemos({ count }: { count: number }) {
  return (
    <StatusRow
      icon="mic-outline"
      text={
        count === 1
          ? "1 voice memo isn't transcribed yet, so it's not included."
          : `${count} voice memos aren't transcribed yet, so they're not included.`
      }
    />
  );
}

function StatusRow({ icon, text }: { icon: ComponentProps<typeof Ionicons>['name'] | null; text: string }) {
  return (
    <View style={styles.statusRow}>
      {icon ? (
        <Ionicons name={icon} size={14} color={SONGA_THEME.textMuted} />
      ) : (
        <ActivityIndicator size="small" color={SONGA_THEME.primaryAccent} />
      )}
      <SongaText variant="caption" style={styles.flex}>
        {text}
      </SongaText>
    </View>
  );
}

function EmptyState({ icon, title, body }: { icon: ComponentProps<typeof Ionicons>['name']; title: string; body: string }) {
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

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

const styles = StyleSheet.create({
  stack: {
    gap: SPACING.lg,
  },
  list: {
    gap: SPACING.sm,
  },
  flex: {
    flex: 1,
  },
  empty: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  writing: {
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xxxl,
  },
  outdated: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  dimmed: {
    opacity: 0.5,
  },
  footer: {
    gap: SPACING.sm,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
});
