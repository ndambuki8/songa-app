import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { computeContainFrame, imageRectToView, viewPointToImage, type Point, type Size } from '@/lib/imageScaling';
import type { Segment, Verdict } from '@/services/api/schemas';
import { BORDERS, RADII, SONGA_THEME } from '@/theme';

import { VERDICT_STYLE } from './verdictStyle';

interface SegmentedImageProps {
  uri: string;
  imageSize: Size;
  segments: readonly Segment[];
  verdicts?: Readonly<Record<string, Verdict>>;
  selectedSegmentId: string | null;
  tapPoint: Point | null;
  onTapImagePoint: (point: Point) => void;
}

const TAP_MARKER = 18;
const BADGE = 20;

export function SegmentedImage({ uri, imageSize, segments, verdicts, selectedSegmentId, tapPoint, onTapImagePoint }: SegmentedImageProps) {
  const [container, setContainer] = useState<Size>({ width: 0, height: 0 });
  const frame = useMemo(() => computeContainFrame(container, imageSize), [container, imageSize]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainer({ width, height });
  };

  const onPress = (event: GestureResponderEvent) => {
    const point = viewPointToImage(
      { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY },
      frame,
      imageSize,
    );
    if (point) onTapImagePoint(point);
  };

  const marker = tapPoint ? imageRectToView({ x: tapPoint.x, y: tapPoint.y, width: 0, height: 0 }, frame) : null;

  return (
    <View style={styles.root} onLayout={onLayout}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onPress}
        accessibilityRole="imagebutton"
        accessibilityLabel="Captured photo. Tap an item to explain it."
      >
        {segments.map((segment) => {
          const rect = imageRectToView(segment.bbox, frame);
          const selected = segment.id === selectedSegmentId;
          const verdict = verdicts?.[segment.id];
          return (
            <View
              key={segment.id}
              pointerEvents="none"
              style={[
                styles.box,
                { left: rect.x, top: rect.y, width: rect.width, height: rect.height },
                verdict ? verdictBoxStyles[verdict] : null,
                selected && !verdict ? styles.boxSelected : null,
              ]}
            >
              {verdict === 'avoid' ? <View style={styles.dim} /> : null}
              {selected && verdict ? <View style={styles.highlight} /> : null}
              {verdict ? (
                <View style={styles.badge}>
                  <Ionicons name={VERDICT_STYLE[verdict].icon} size={BADGE} color={SONGA_THEME[VERDICT_STYLE[verdict].color]} />
                </View>
              ) : null}
            </View>
          );
        })}
        {marker ? (
          <View
            pointerEvents="none"
            style={[styles.marker, { left: marker.x - TAP_MARKER / 2, top: marker.y - TAP_MARKER / 2 }]}
          />
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    borderRadius: RADII.lg,
    overflow: 'hidden',
    backgroundColor: SONGA_THEME.textDark,
  },
  box: {
    position: 'absolute',
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.primaryAccent,
    borderRadius: RADII.sm,
  },
  boxSelected: {
    borderWidth: BORDERS.heavy,
    borderColor: SONGA_THEME.surfaceNatural,
  },
  marker: {
    position: 'absolute',
    width: TAP_MARKER,
    height: TAP_MARKER,
    borderRadius: TAP_MARKER / 2,
    borderWidth: 3,
    borderColor: SONGA_THEME.background,
    backgroundColor: SONGA_THEME.primaryAccent,
  },
  dim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: SONGA_THEME.textDark,
    opacity: 0.45,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: SONGA_THEME.primaryAccent,
    opacity: 0.3,
  },
  badge: {
    position: 'absolute',
    top: -BADGE / 2,
    left: -BADGE / 2,
    borderRadius: BADGE / 2,
    backgroundColor: SONGA_THEME.background,
  },
});

const verdictBoxStyles = StyleSheet.create({
  avoid: {
    borderWidth: BORDERS.heavy,
    borderColor: SONGA_THEME.textDark,
  },
  ask: {
    borderWidth: BORDERS.heavy,
    borderStyle: 'dashed',
    borderColor: SONGA_THEME.secondaryAccent,
  },
  safe: {
    borderWidth: BORDERS.hard,
    borderColor: SONGA_THEME.primaryAccent,
  },
});
