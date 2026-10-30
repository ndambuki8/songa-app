import { JournalView } from '@/features/journal/components/JournalView';
import { useLogbook } from '@/features/journal/hooks/useLogbook';

export default function JournalScreen() {
  const logbook = useLogbook();
  return <JournalView logbook={logbook} />;
}
