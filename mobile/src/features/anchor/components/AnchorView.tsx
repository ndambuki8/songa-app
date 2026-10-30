import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { Card, ErrorBanner, PrimaryButton, Screen, SongaText, StatusPill } from '@/components/ui';
import { formatClockTime } from '@/lib/dates';
import { cardinalDirection, formatDistance } from '@/lib/geo';
import { BORDERS, RADII, SONGA_THEME, SPACING, TYPOGRAPHY } from '@/theme';

import type { AnchorNavigator } from '../hooks/useAnchorNavigator';
import { CompassArrow } from './CompassArrow';

interface AnchorViewProps {
  anchor: AnchorNavigator;
}

export function AnchorView({ anchor }: AnchorViewProps) {
  return (
    <Screen
      title="Anchor"
      subtitle="Works fully offline: GPS and compass only"
      headerAccessory={<StatusPill label="Offline-ready" />}
      scrollable
    >
      <View style={styles.stack}>
        {anchor.error ? <ErrorBanner message={anchor.error} onDismiss={anchor.dismissError} /> : null}
        {anchor.anchorCoordinates ? <Navigator anchor={anchor} /> : <LockForm anchor={anchor} />}
      </View>
    </Screen>
  );
}

function LockForm({ anchor }: AnchorViewProps) {
  const [label, setLabel] = useState('');

  return (
    <Card tone="bordered" style={styles.lockCard}>
      <Ionicons name="home-outline" size={32} color={SONGA_THEME.primaryAccent} />
      <SongaText variant="title">Lock your home base</SongaText>
      <SongaText variant="body" color="textMuted">
        When you check in, lock this spot. If data or maps fail later, Songa still points you back here with a
        compass arrow and the distance in meters.
      </SongaText>
      <TextInput
        value={label}
        onChangeText={setLabel}
        placeholder="Name it, e.g. Hotel Sakura"
        placeholderTextColor={SONGA_THEME.textMuted}
        style={styles.input}
        accessibilityLabel="Anchor name"
        maxLength={40}
      />
      <PrimaryButton
        label="Lock Anchor Location"
        icon="lock-closed"
        loading={anchor.locking}
        onPress={() => void anchor.lockAnchorLocation(label)}
      />
      {anchor.permission === 'denied' ? (
        <SongaText variant="caption">Location access is off. Enable it for Songa in your device settings.</SongaText>
      ) : null}
    </Card>
  );
}

function Navigator({ anchor }: AnchorViewProps) {
  const point = anchor.anchorCoordinates!;
  const nav = anchor.navigation;
  const distance = nav ? formatDistance(nav.distanceMeters) : null;

  const confirmClear = () =>
    Alert.alert('Clear anchor?', `Songa will stop guiding you back to ${point.label}.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => void anchor.clearAnchor() },
    ]);

  return (
    <View style={styles.stack}>
      <View style={styles.anchorHeader}>
        <View style={styles.anchorTitle}>
          <SongaText variant="caption">Heading back to</SongaText>
          <SongaText variant="title">{point.label}</SongaText>
        </View>
        <SongaText variant="caption">Locked {formatClockTime(point.lockedAt)}</SongaText>
      </View>

      {anchor.permission !== 'granted' ? (
        <Card tone="bordered">
          <SongaText variant="body">Location access is needed to guide you back.</SongaText>
          <PrimaryButton label="Allow location" icon="navigate" onPress={() => void anchor.requestPermission()} />
        </Card>
      ) : nav?.arrived ? (
        <Card style={styles.arrived}>
          <Ionicons name="checkmark-circle" size={48} color={SONGA_THEME.primaryAccent} />
          <SongaText variant="title" align="center">
            You&apos;re home
          </SongaText>
          <SongaText variant="body" color="textMuted" align="center">
            You are within a few meters of {point.label}.
          </SongaText>
        </Card>
      ) : (
        <>
          <CompassArrow rotation={nav?.arrowRotation ?? null} size={260} />
          <View style={styles.readout}>
            {distance ? (
              <View style={styles.distanceRow}>
                <SongaText variant="metric">{distance.value}</SongaText>
                <SongaText variant="title">{distance.unit}</SongaText>
              </View>
            ) : (
              <SongaText variant="subtitle">Finding your position…</SongaText>
            )}
            {nav ? (
              <SongaText variant="label" color="textMuted">
                {cardinalDirection(nav.bearingToAnchor)} · {Math.round(nav.bearingToAnchor)}° from north
              </SongaText>
            ) : null}
            {nav && nav.arrowRotation === null ? (
              <SongaText variant="caption">Compass warming up. The arrow activates once a heading is available.</SongaText>
            ) : null}
            {anchor.gpsSearching ? <SongaText variant="caption">Waiting for a GPS fix. Move toward open sky.</SongaText> : null}
            {anchor.currentAccuracy !== null ? (
              <SongaText variant="caption">GPS accuracy ±{Math.round(anchor.currentAccuracy)} m</SongaText>
            ) : null}
          </View>
        </>
      )}

      <PrimaryButton label="Clear anchor" icon="close-circle-outline" variant="outline" onPress={confirmClear} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: SPACING.lg,
  },
  lockCard: {
    gap: SPACING.md,
  },
  input: {
    ...TYPOGRAPHY.body,
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.md,
    backgroundColor: SONGA_THEME.background,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
  },
  anchorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  anchorTitle: {
    flex: 1,
  },
  readout: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.xs,
  },
  arrived: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
  },
});
