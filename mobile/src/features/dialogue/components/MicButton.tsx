import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet } from 'react-native';

import { SONGA_THEME } from '@/theme';

interface MicButtonProps {
  recording: boolean;
  processing: boolean;
  disabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}

const SIZE = 72;

export function MicButton({ recording, processing, disabled, onPress, accessibilityLabel }: MicButtonProps) {
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!recording) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, recording]);

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled, busy: processing, selected: recording }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: recording || pressed ? SONGA_THEME.secondaryAccent : SONGA_THEME.primaryAccent },
          disabled && !processing ? styles.disabled : null,
        ]}
      >
        {processing ? (
          <ActivityIndicator color={SONGA_THEME.background} />
        ) : (
          <Ionicons name={recording ? 'stop' : 'mic'} size={30} color={SONGA_THEME.background} />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});
