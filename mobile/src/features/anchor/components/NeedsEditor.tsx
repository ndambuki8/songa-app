import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, SongaText } from '@/components/ui';
import type { TravelerNeeds } from '@/storage/preferences';
import { BORDERS, RADII, SONGA_THEME, SPACING, TYPOGRAPHY } from '@/theme';

const ALLERGIES = ['Peanuts', 'Tree nuts', 'Shellfish', 'Fish', 'Gluten', 'Dairy', 'Egg', 'Soy', 'Sesame'] as const;
const DIETS = ['Vegetarian', 'Vegan', 'Halal', 'Kosher', 'No pork', 'No beef', 'No alcohol'] as const;

interface NeedsEditorProps {
  visible: boolean;
  initial: TravelerNeeds;
  onSave: (needs: TravelerNeeds) => void;
  onClose: () => void;
}

export function NeedsEditor({ visible, initial, onSave, onClose }: NeedsEditorProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<TravelerNeeds>(initial);

  const toggle = (field: 'allergies' | 'diet', value: string) =>
    setDraft((current) => ({
      ...current,
      [field]: current[field].includes(value) ? current[field].filter((item) => item !== value) : [...current[field], value],
    }));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} onShow={() => setDraft(initial)}>
      <View style={[styles.root, { paddingTop: SPACING.lg, paddingBottom: insets.bottom + SPACING.md }]}>
        <View style={styles.header}>
          <SongaText variant="title" style={styles.flex}>
            My needs
          </SongaText>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={SONGA_THEME.textDark} />
          </Pressable>
        </View>
        <SongaText variant="body" color="textMuted">
          Look warns you when a dish may not suit you, and Songa writes a card you can show a waiter or pharmacist.
          Everything stays on this phone.
        </SongaText>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ChipGroup title="Allergies" options={ALLERGIES} selected={draft.allergies} onToggle={(v) => toggle('allergies', v)} />
          <ChipGroup title="Diet" options={DIETS} selected={draft.diet} onToggle={(v) => toggle('diet', v)} />
          <View style={styles.group}>
            <SongaText variant="label">Anything else</SongaText>
            <TextInput
              value={draft.notes}
              onChangeText={(notes) => setDraft((current) => ({ ...current, notes }))}
              placeholder="Other allergies, medicines, conditions, e.g. diabetic, carry an EpiPen"
              placeholderTextColor={SONGA_THEME.textMuted}
              style={styles.input}
              multiline
              maxLength={400}
              accessibilityLabel="Other needs"
            />
          </View>
        </ScrollView>

        <PrimaryButton
          label="Save"
          icon="checkmark"
          onPress={() => {
            onSave({ ...draft, notes: draft.notes.trim() });
            onClose();
          }}
        />
      </View>
    </Modal>
  );
}

function ChipGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: readonly string[];
  selected: readonly string[];
  onToggle: (value: string) => void;
}) {
  return (
    <View style={styles.group}>
      <SongaText variant="label">{title}</SongaText>
      <View style={styles.chips}>
        {options.map((option) => {
          const on = selected.includes(option);
          return (
            <Pressable
              key={option}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => onToggle(option)}
              style={[styles.chip, on ? styles.chipOn : null]}
            >
              {on ? <Ionicons name="checkmark" size={14} color={SONGA_THEME.background} /> : null}
              <SongaText variant="label" style={on ? styles.chipOnText : null}>
                {option}
              </SongaText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SONGA_THEME.background,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  content: {
    gap: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  group: {
    gap: SPACING.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xxs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.pill,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
  },
  chipOn: {
    backgroundColor: SONGA_THEME.primaryAccent,
    borderColor: SONGA_THEME.primaryAccent,
  },
  chipOnText: {
    color: SONGA_THEME.background,
  },
  input: {
    ...TYPOGRAPHY.body,
    minHeight: 88,
    padding: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
    textAlignVertical: 'top',
  },
});
