import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { VisualInterpreterView } from '@/features/vision/components/VisualInterpreterView';
import { useVisualInterpreter } from '@/features/vision/hooks/useVisualInterpreter';
import { warmUpVision } from '@/services/api/client';

export default function LookScreen() {
  const vision = useVisualInterpreter();
  const [focused, setFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      // Boots the segmentation GPU while the traveler is still framing the photo.
      warmUpVision();
      return () => setFocused(false);
    }, []),
  );

  return <VisualInterpreterView vision={vision} cameraActive={focused} />;
}
