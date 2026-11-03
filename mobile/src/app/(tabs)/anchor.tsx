import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { AnchorView } from '@/features/anchor/components/AnchorView';
import { useAnchorNavigator } from '@/features/anchor/hooks/useAnchorNavigator';
import { useLocalCards } from '@/features/anchor/hooks/useLocalCards';

export default function AnchorScreen() {
  const anchor = useAnchorNavigator();
  const [focused, setFocused] = useState(false);
  const cards = useLocalCards({ anchor: anchor.anchorCoordinates, active: focused && anchor.pinpoint === null });

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  return <AnchorView anchor={anchor} cards={cards} />;
}
