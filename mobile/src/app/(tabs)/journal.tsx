import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { JournalView } from '@/features/journal/components/JournalView';
import { useLogbook } from '@/features/journal/hooks/useLogbook';

export default function JournalScreen() {
  const logbook = useLogbook();
  const [focused, setFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  return <JournalView logbook={logbook} focused={focused} />;
}
