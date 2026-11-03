import { TripPlannerView } from '@/features/trip/components/TripPlannerView';
import { useTripPlanner } from '@/features/trip/hooks/useTripPlanner';

export default function TripScreen() {
  const trip = useTripPlanner();
  return <TripPlannerView trip={trip} />;
}
