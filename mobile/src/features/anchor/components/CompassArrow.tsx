import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { shortestRotation } from '@/lib/geo';
import { SONGA_THEME } from '@/theme';

interface CompassArrowProps {
  /** Degrees clockwise from the top of the screen, or `null` while the compass is unavailable. */
  rotation: number | null;
  size: number;
}

export function CompassArrow({ rotation, size }: CompassArrowProps) {
  const [animated] = useState(() => new Animated.Value(0));
  const unbounded = useRef(0);

  useEffect(() => {
    if (rotation === null) return;
    const next = shortestRotation(unbounded.current, rotation);
    unbounded.current = next;
    Animated.timing(animated, {
      toValue: next,
      duration: 250,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [animated, rotation]);

  const rotate = useMemo(
    () => animated.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }),
    [animated],
  );

  return (
    <View style={[styles.root, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 200 200" style={StyleSheet.absoluteFill}>
        <Circle cx={100} cy={100} r={96} fill={SONGA_THEME.surfaceNatural} />
        <Circle cx={100} cy={100} r={96} fill="none" stroke={SONGA_THEME.textDark} strokeWidth={1.5} />
        <Circle cx={100} cy={10} r={4} fill={SONGA_THEME.textDark} />
      </Svg>
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }, rotation === null ? styles.inactive : null]}
        accessibilityElementsHidden
      >
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <Path d="M100 22 L148 150 L100 124 L52 150 Z" fill={SONGA_THEME.primaryAccent} />
          <Path d="M100 22 L100 124 L52 150 Z" fill={SONGA_THEME.secondaryAccent} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'center',
  },
  inactive: {
    opacity: 0.25,
  },
});
