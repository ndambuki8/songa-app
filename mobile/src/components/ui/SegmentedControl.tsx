import { Pressable, StyleSheet, View } from 'react-native';

import { BORDERS, RADII, SONGA_THEME, SPACING } from '@/theme';

import { SongaText } from './SongaText';

interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <View style={styles.root} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected ? styles.selected : null]}
          >
            <SongaText variant="label" style={{ color: selected ? SONGA_THEME.background : SONGA_THEME.textDark }}>
              {option.label}
            </SongaText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    padding: SPACING.xs,
    borderRadius: RADII.pill,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
    backgroundColor: SONGA_THEME.background,
    gap: SPACING.xs,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderRadius: RADII.pill,
  },
  selected: {
    backgroundColor: SONGA_THEME.primaryAccent,
  },
});
