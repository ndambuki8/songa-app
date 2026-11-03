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
  /** Light button with a green glyph, for use on the green resident half. */
  inverse?: boolean;
}

const SIZE = 88;

export function MicButton({ recording, processing, disabled, onPress, accessibilityLabel, inverse = false }: MicButtonProps) {
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

  const idleFill = inverse ? SONGA_THEME.background : SONGA_THEME.primaryAccent;
  const activeFill = inverse ? SONGA_THEME.surfaceNatural : SONGA_THEME.secondaryAccent;
  const glyph = inverse ? SONGA_THEME.primaryAccent : SONGA_THEME.background;

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled, busy: processing, selected: recording }}
        disabled={disabled}
        onPress={onPress}
        hitSlop={12}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: recording || pressed ? activeFill : idleFill },
          disabled && !processing ? styles.disabled : null,
        ]}
      >
        {processing ? (
          <ActivityIndicator color={glyph} size="large" />
        ) : (
          <Ionicons name={recording ? 'stop' : 'mic'} size={38} color={glyph} />
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
