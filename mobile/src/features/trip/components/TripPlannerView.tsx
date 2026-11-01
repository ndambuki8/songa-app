import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ErrorBanner, PrimaryButton, Screen } from '@/components/ui';
import { addDays, formatDayLabel } from '@/lib/dates';
import { SONGA_THEME, SPACING } from '@/theme';

import type { TripPlanner } from '../hooks/useTripPlanner';
import { TripBriefingView } from './TripBriefingView';
import { TripForm } from './TripForm';

interface TripPlannerViewProps {
  trip: TripPlanner;
}

export function TripPlannerView({ trip }: TripPlannerViewProps) {
  const { briefing, draft } = trip;
  const showBriefing = briefing !== null && !trip.showForm;
  const range = `${formatDayLabel(draft.startDate, trip.travelerLocale)} – ${formatDayLabel(addDays(draft.startDate, draft.days - 1), trip.travelerLocale)}`;

  return (
    <Screen
      title={showBriefing ? briefing.destination : 'Plan a trip'}
      subtitle={showBriefing ? `${range} · saved for offline use` : 'Tell Songa where you are going. It prepares your days, phrases and tips.'}
      headerAccessory={
        showBriefing ? <PrimaryButton label="Edit" icon="create-outline" variant="outline" compact onPress={trip.editTrip} /> : null
      }
      scrollable
    >
      <View style={styles.stack}>
        {trip.error ? <ErrorBanner message={trip.error} onDismiss={trip.dismissError} /> : null}
        {!trip.loaded ? (
          <ActivityIndicator color={SONGA_THEME.primaryAccent} />
        ) : showBriefing ? (
          <TripBriefingView
            briefing={briefing}
            travelerLocale={trip.travelerLocale}
            onSpeakPhrase={trip.speakPhrase}
            onStartOver={trip.startOver}
          />
        ) : (
          <TripForm trip={trip} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: SPACING.lg,
  },
});
