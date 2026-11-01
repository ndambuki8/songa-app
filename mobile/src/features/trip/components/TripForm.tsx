import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Card, LanguagePicker, PrimaryButton, SongaText } from '@/components/ui';
import { formatDayLabel, localDayKey } from '@/lib/dates';
import { usePreferences } from '@/storage/preferences';
import { BORDERS, RADII, SONGA_THEME, SPACING, TYPOGRAPHY } from '@/theme';

import type { TripPlanner } from '../hooks/useTripPlanner';
import { MAX_TRIP_DAYS } from '../tripStore';

interface TripFormProps {
  trip: TripPlanner;
}

export function TripForm({ trip }: TripFormProps) {
  const prefs = usePreferences();
  const { draft } = trip;
  const isToday = draft.startDate === localDayKey(new Date());

  return (
    <View style={styles.stack}>
      <Field label="Where are you going?">
        <TextInput
          value={draft.destination}
          onChangeText={(destination) => trip.updateDraft({ destination })}
          placeholder="City or country, e.g. Kyoto"
          placeholderTextColor={SONGA_THEME.textMuted}
          style={styles.input}
          maxLength={120}
          accessibilityLabel="Destination"
        />
      </Field>

      <LanguagePicker wide caption="Language spoken there" locale={prefs.residentLocale} onChange={prefs.setResidentLocale} />

      <Card style={styles.steppers}>
        <Stepper
          label="Starting"
          value={isToday ? `Today, ${formatDayLabel(draft.startDate, trip.travelerLocale)}` : formatDayLabel(draft.startDate, trip.travelerLocale)}
          decreaseIcon="chevron-back"
          increaseIcon="chevron-forward"
          decreaseLabel="One day earlier"
          increaseLabel="One day later"
          canDecrease={!isToday}
          canIncrease
          onDecrease={() => trip.shiftStart(-1)}
          onIncrease={() => trip.shiftStart(1)}
        />
        <Stepper
          label="How long"
          value={draft.days === 1 ? '1 day' : `${draft.days} days`}
          decreaseIcon="remove"
          increaseIcon="add"
          decreaseLabel="One day fewer"
          increaseLabel="One day more"
          canDecrease={draft.days > 1}
          canIncrease={draft.days < MAX_TRIP_DAYS}
          onDecrease={() => trip.changeLength(-1)}
          onIncrease={() => trip.changeLength(1)}
        />
      </Card>

      <Field label="Where are you staying?">
        <TextInput
          value={draft.stay}
          onChangeText={(stay) => trip.updateDraft({ stay })}
          placeholder="Hotel or area (optional)"
          placeholderTextColor={SONGA_THEME.textMuted}
          style={styles.input}
          maxLength={160}
          accessibilityLabel="Where you are staying"
        />
      </Field>

      <Field label="Anything Songa should know?">
        <TextInput
          value={draft.needs}
          onChangeText={(needs) => trip.updateDraft({ needs })}
          placeholder="Vegetarian, travelling with kids, peanut allergy…"
          placeholderTextColor={SONGA_THEME.textMuted}
          style={[styles.input, styles.multiline]}
          multiline
          maxLength={400}
          accessibilityLabel="Your needs"
        />
      </Field>

      <View style={styles.actions}>
        <PrimaryButton label="Plan my trip" icon="airplane" loading={trip.planning} onPress={() => void trip.plan()} />
        {trip.planning ? (
          <SongaText variant="caption" align="center">
            Planning your days. This can take up to a minute.
          </SongaText>
        ) : null}
        {trip.canCancelEdit ? <PrimaryButton label="Cancel" variant="outline" onPress={trip.cancelEdit} /> : null}
      </View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <SongaText variant="label">{label}</SongaText>
      {children}
    </View>
  );
}

type IconName = ComponentProps<typeof Ionicons>['name'];

interface StepperProps {
  label: string;
  value: string;
  decreaseIcon: IconName;
  increaseIcon: IconName;
  decreaseLabel: string;
  increaseLabel: string;
  canDecrease: boolean;
  canIncrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}

function Stepper(props: StepperProps) {
  return (
    <View style={styles.stepper}>
      <View style={styles.stepperText}>
        <SongaText variant="caption">{props.label}</SongaText>
        <SongaText variant="subtitle">{props.value}</SongaText>
      </View>
      <StepButton icon={props.decreaseIcon} label={props.decreaseLabel} disabled={!props.canDecrease} onPress={props.onDecrease} />
      <StepButton icon={props.increaseIcon} label={props.increaseLabel} disabled={!props.canIncrease} onPress={props.onIncrease} />
    </View>
  );
}

function StepButton({ icon, label, disabled, onPress }: { icon: IconName; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.stepButton, pressed ? styles.stepButtonPressed : null, disabled ? styles.disabled : null]}
    >
      <Ionicons name={icon} size={22} color={SONGA_THEME.textDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: SPACING.lg,
  },
  field: {
    gap: SPACING.xs,
  },
  input: {
    ...TYPOGRAPHY.body,
    minHeight: 48,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.md,
    backgroundColor: SONGA_THEME.background,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
  },
  multiline: {
    minHeight: 88,
    paddingVertical: SPACING.sm,
    textAlignVertical: 'top',
  },
  steppers: {
    gap: SPACING.md,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  stepperText: {
    flex: 1,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SONGA_THEME.background,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
  },
  stepButtonPressed: {
    backgroundColor: SONGA_THEME.surfaceNatural,
  },
  disabled: {
    opacity: 0.35,
  },
  actions: {
    gap: SPACING.sm,
  },
});
