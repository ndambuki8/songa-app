import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Card, ErrorBanner, PrimaryButton, Screen, SongaText, StatusPill } from '@/components/ui';
import { findLanguage } from '@/config/languages';
import { cardinalDirection, formatDistance } from '@/lib/geo';
import { usePreferences } from '@/storage/preferences';
import { BORDERS, RADII, SONGA_THEME, SPACING, TYPOGRAPHY } from '@/theme';

import { LOOSE_LOCK_M, type AnchorNavigator, type AnchorPoint } from '../hooks/useAnchorNavigator';
import type { CardState } from '../hooks/useLocalCards';
import { CompassArrow } from './CompassArrow';
import { LocalCardSheet } from './LocalCardSheet';
import { NeedsEditor } from './NeedsEditor';

interface AnchorViewProps {
  anchor: AnchorNavigator;
  cards: { home: CardState; needs: CardState };
}

type OpenSheet = 'home' | 'needs' | 'editNeeds' | null;

export function AnchorView({ anchor, cards }: AnchorViewProps) {
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const { residentLocale, setResidentLocale, needs, setNeeds } = usePreferences();
  const point = anchor.anchorCoordinates;

  return (
    <Screen title="Anchor" subtitle="Your way back, even with no signal" headerAccessory={<StatusPill label="Offline-ready" />} scrollable>
      <View style={styles.stack}>
        {anchor.error ? <ErrorBanner message={anchor.error} onDismiss={anchor.dismissError} /> : null}

        {!anchor.anchorLoaded ? (
          <ActivityIndicator color={SONGA_THEME.primaryAccent} />
        ) : anchor.pinpoint ? (
          <Pinpointing anchor={anchor} />
        ) : point ? (
          <Navigator anchor={anchor} point={point} />
        ) : (
          <LockForm anchor={anchor} />
        )}

        {!anchor.pinpoint ? (
          <View style={styles.cards}>
            <SongaText variant="label">Show a local</SongaText>
            <CardTile
              icon="car-outline"
              title="Take me home"
              state={cards.home}
              ready={`Your address and taxi phrases in ${findLanguage(residentLocale).label}`}
              unavailable="Anchor where you're staying first."
              onPress={() => setSheet('home')}
            />
            <CardTile
              icon="restaurant-outline"
              title="My needs"
              state={cards.needs}
              ready={`Allergies and diet in ${findLanguage(residentLocale).label}`}
              unavailable="Add allergies or diet. Look will warn you too."
              onPress={() => setSheet(cards.needs.available ? 'needs' : 'editNeeds')}
              accessory={
                cards.needs.available ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Edit my needs" onPress={() => setSheet('editNeeds')} hitSlop={10}>
                    <SongaText variant="label" color="primaryAccent">
                      Edit
                    </SongaText>
                  </Pressable>
                ) : null
              }
            />
          </View>
        ) : null}
      </View>

      <LocalCardSheet
        visible={sheet === 'home'}
        onClose={() => setSheet(null)}
        state={cards.home}
        locale={residentLocale}
        onLocaleChange={setResidentLocale}
        fallback={{
          title: point?.label ?? 'Home base',
          lines: point
            ? [...(point.address ? [point.address] : []), `GPS ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`]
            : [],
        }}
      />
      <LocalCardSheet
        visible={sheet === 'needs'}
        onClose={() => setSheet(null)}
        state={cards.needs}
        locale={residentLocale}
        onLocaleChange={setResidentLocale}
        fallback={{
          title: 'My needs',
          lines: [needs.allergies.length ? `Allergies: ${needs.allergies.join(', ')}` : '', needs.diet.join(', '), needs.notes].filter(Boolean),
        }}
      />
      <NeedsEditor visible={sheet === 'editNeeds'} initial={needs} onSave={setNeeds} onClose={() => setSheet(null)} />
    </Screen>
  );
}

function LockForm({ anchor }: { anchor: AnchorNavigator }) {
  const [label, setLabel] = useState('');

  return (
    <Card tone="bordered" style={styles.lockCard}>
      <Ionicons name="home-outline" size={32} color={SONGA_THEME.primaryAccent} />
      <SongaText variant="title">Anchor where you&apos;re staying</SongaText>
      <SongaText variant="body" color="textMuted">
        Do this once at your hotel or Airbnb. Songa pinpoints the exact spot, then guides you back with an arrow
        and the distance, even with no data or maps.
      </SongaText>
      <TextInput
        value={label}
        onChangeText={setLabel}
        placeholder="Name (optional), e.g. Hotel Sakura"
        placeholderTextColor={SONGA_THEME.textMuted}
        style={styles.input}
        accessibilityLabel="Anchor name"
        maxLength={40}
      />
      <PrimaryButton label="Anchor this spot" icon="locate" onPress={() => void anchor.lockAnchorLocation(label)} />
      {anchor.permission === 'denied' ? (
        <SongaText variant="caption">Location access is off. Enable it for Songa in your device settings.</SongaText>
      ) : null}
    </Card>
  );
}

function Pinpointing({ anchor }: { anchor: AnchorNavigator }) {
  const progress = anchor.pinpoint!;
  const accuracy = progress.accuracy;
  const quality = accuracy === null ? 'Searching for satellites…' : accuracy <= 10 ? 'Excellent' : accuracy <= 25 ? 'Good' : 'Rough';

  return (
    <Card tone="bordered" style={styles.pinCard}>
      <ActivityIndicator color={SONGA_THEME.primaryAccent} size="large" />
      <SongaText variant="title" align="center">
        Pinpointing your exact spot
      </SongaText>
      {accuracy !== null ? (
        <View style={styles.distanceRow}>
          <SongaText variant="metric">±{Math.round(accuracy)}</SongaText>
          <SongaText variant="title">m</SongaText>
        </View>
      ) : null}
      <SongaText variant="label" align="center">
        {quality}
      </SongaText>
      <SongaText variant="body" color="textMuted" align="center">
        Hold still. Near a window or just outside the entrance gives the sharpest lock. This takes up to 20 seconds.
      </SongaText>
      <View style={styles.pinActions}>
        <PrimaryButton label="Use this spot" icon="checkmark" disabled={accuracy === null} onPress={anchor.acceptPinpoint} />
        <PrimaryButton label="Cancel" variant="outline" onPress={anchor.cancelPinpoint} />
      </View>
    </Card>
  );
}

function Navigator({ anchor, point }: { anchor: AnchorNavigator; point: AnchorPoint }) {
  const nav = anchor.navigation;
  const distance = nav ? formatDistance(nav.distanceMeters) : null;
  const loose = point.accuracy !== null && point.accuracy > LOOSE_LOCK_M;

  const reanchor = () =>
    Alert.alert('Re-anchor here?', `This replaces ${point.label} with where you are standing now.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Re-anchor', onPress: () => void anchor.lockAnchorLocation(point.label) },
    ]);
  const confirmClear = () =>
    Alert.alert('Remove anchor?', `Songa will stop guiding you back to ${point.label}.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void anchor.clearAnchor() },
    ]);

  return (
    <View style={styles.stack}>
      <View>
        <SongaText variant="caption">Heading back to</SongaText>
        <SongaText variant="title">{point.label}</SongaText>
        {point.address ? <SongaText variant="caption">{point.address}</SongaText> : null}
        {point.accuracy !== null ? (
          <SongaText variant="caption">Anchored to within ±{Math.round(point.accuracy)} m</SongaText>
        ) : null}
      </View>

      {loose ? (
        <Card style={styles.inlineCard}>
          <SongaText variant="body" style={styles.flex}>
            This anchor is rough (±{Math.round(point.accuracy ?? 0)} m). Re-anchor near a window or outside for a sharper one.
          </SongaText>
          <PrimaryButton label="Re-anchor" compact onPress={reanchor} />
        </Card>
      ) : null}

      {anchor.permission !== 'granted' ? (
        <Card tone="bordered">
          <SongaText variant="body">Location access is needed to guide you back.</SongaText>
          <PrimaryButton label="Allow location" icon="navigate" onPress={() => void anchor.requestPermission()} />
        </Card>
      ) : nav?.arrived ? (
        <Card style={styles.arrived}>
          <Ionicons name="checkmark-circle" size={48} color={SONGA_THEME.primaryAccent} />
          <SongaText variant="title" align="center">
            You&apos;re here
          </SongaText>
          <SongaText variant="body" color="textMuted" align="center">
            {point.label} is within a few meters.
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
                {nav.close ? `Almost there. Look for ${point.label}.` : `Head ${cardinalDirection(nav.bearingToAnchor)} · ${Math.round(nav.bearingToAnchor)}° from north`}
              </SongaText>
            ) : null}
            {nav && nav.arrowRotation === null ? (
              <SongaText variant="caption">Compass warming up. Hold the phone flat.</SongaText>
            ) : null}
            {anchor.gpsSearching ? <SongaText variant="caption">Waiting for a GPS fix. Move toward open sky.</SongaText> : null}
            {anchor.currentAccuracy !== null ? (
              <SongaText variant="caption">Your position ±{Math.round(anchor.currentAccuracy)} m</SongaText>
            ) : null}
          </View>
        </>
      )}

      <View style={styles.footerRow}>
        <Pressable accessibilityRole="button" onPress={reanchor} hitSlop={10}>
          <SongaText variant="label" color="primaryAccent">
            Re-anchor here
          </SongaText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={confirmClear} hitSlop={10}>
          <SongaText variant="label" color="textMuted">
            Remove anchor
          </SongaText>
        </Pressable>
      </View>
    </View>
  );
}

interface CardTileProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  state: CardState;
  ready: string;
  unavailable: string;
  onPress: () => void;
  accessory?: React.ReactNode;
}

function CardTile({ icon, title, state, ready, unavailable, onPress, accessory }: CardTileProps) {
  const status = !state.available
    ? unavailable
    : state.card
      ? `${ready}. Saved for offline.`
      : state.generating
        ? 'Translating…'
        : state.error
          ? 'Not translated yet. Tap to retry or show the basics.'
          : 'Will translate when you are online.';
  const disabled = !state.available && title === 'Take me home';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed ? styles.tilePressed : null, disabled ? styles.tileDisabled : null]}
    >
      <Ionicons name={icon} size={26} color={SONGA_THEME.primaryAccent} />
      <View style={styles.flex}>
        <SongaText variant="subtitle">{title}</SongaText>
        <SongaText variant="caption">{status}</SongaText>
      </View>
      {state.generating ? <ActivityIndicator color={SONGA_THEME.primaryAccent} /> : null}
      {accessory}
      <Ionicons name="chevron-forward" size={20} color={SONGA_THEME.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: SPACING.lg,
  },
  flex: {
    flex: 1,
  },
  lockCard: {
    gap: SPACING.md,
  },
  pinCard: {
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.xl,
  },
  pinActions: {
    alignSelf: 'stretch',
    gap: SPACING.sm,
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
  inlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
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
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cards: {
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADII.md,
    backgroundColor: SONGA_THEME.surfaceNatural,
  },
  tilePressed: {
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
  },
  tileDisabled: {
    opacity: 0.5,
  },
});
