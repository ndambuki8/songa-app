import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { VisualInterpreterView } from '@/features/vision/components/VisualInterpreterView';
import { useVisualInterpreter } from '@/features/vision/hooks/useVisualInterpreter';

export default function LookScreen() {
  const vision = useVisualInterpreter();
  const [focused, setFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  return <VisualInterpreterView vision={vision} cameraActive={focused} />;
}
