import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { computeContainFrame, imageRectToView, viewPointToImage, type Point, type Size } from '@/lib/imageScaling';
import type { Segment } from '@/services/api/schemas';
import { BORDERS, RADII, SONGA_THEME } from '@/theme';

interface SegmentedImageProps {
  uri: string;
  imageSize: Size;
  segments: readonly Segment[];
  selectedSegmentId: string | null;
  tapPoint: Point | null;
  onTapImagePoint: (point: Point) => void;
}

const TAP_MARKER = 18;

export function SegmentedImage({ uri, imageSize, segments, selectedSegmentId, tapPoint, onTapImagePoint }: SegmentedImageProps) {
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
          return (
            <View
              key={segment.id}
              pointerEvents="none"
              style={[
                styles.box,
                { left: rect.x, top: rect.y, width: rect.width, height: rect.height },
                selected ? styles.boxSelected : null,
              ]}
            />
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
});
