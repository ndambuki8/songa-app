import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, SongaText } from '@/components/ui';
import { usePreferences } from '@/storage/preferences';
import { BORDERS, RADII, SONGA_THEME, SPACING, TYPOGRAPHY } from '@/theme';

import { FOOD_NEED_OPTIONS, summarizeFoodNeeds } from '../foodNeeds';

export function FoodNeedsButton() {
  const { foodNeeds } = usePreferences();
  const [open, setOpen] = useState(false);
  const summary = summarizeFoodNeeds(foodNeeds);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={summary ? `My food needs: ${summary}. Edit` : 'Add your food needs'}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
      >
        <Ionicons name="restaurant-outline" size={20} color={SONGA_THEME.primaryAccent} />
        <View style={styles.buttonText}>
          <SongaText variant="caption">My food needs</SongaText>
          <SongaText variant="label" numberOfLines={1}>
            {summary || 'Add allergies or diet to check menus'}
          </SongaText>
        </View>
        <Ionicons name="create-outline" size={18} color={SONGA_THEME.textDark} />
      </Pressable>
      {open ? <FoodNeedsSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function FoodNeedsSheet({ onClose }: { onClose: () => void }) {
  const { foodNeeds, setFoodNeeds } = usePreferences();
  const insets = useSafeAreaInsets();
  const [tags, setTags] = useState<string[]>(foodNeeds.tags);
  const [note, setNote] = useState(foodNeeds.note);

  const toggle = (id: string) => setTags((current) => (current.includes(id) ? current.filter((tag) => tag !== id) : [...current, id]));

  const save = () => {
    setFoodNeeds({ tags, note });
    onClose();
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close food needs" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg }]}>
        <SongaText variant="title">My food needs</SongaText>
        <SongaText variant="body" color="textMuted">
          Songa checks every dish on a menu photo against these.
        </SongaText>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.chips}>
            {FOOD_NEED_OPTIONS.map((option) => {
              const selected = tags.includes(option.id);
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  onPress={() => toggle(option.id)}
                  style={[styles.chip, selected ? styles.chipSelected : null]}
                >
                  {selected ? <Ionicons name="checkmark" size={16} color={SONGA_THEME.background} /> : null}
                  <SongaText variant="label" color={selected ? 'background' : 'textDark'}>
                    {option.label}
                  </SongaText>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Anything else, e.g. severe reaction, no raw food"
            placeholderTextColor={SONGA_THEME.textMuted}
            style={styles.note}
            multiline
            maxLength={200}
            accessibilityLabel="Other food needs"
          />
        </ScrollView>
        <PrimaryButton label="Save" icon="checkmark" onPress={save} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
    backgroundColor: SONGA_THEME.background,
  },
  buttonPressed: {
    backgroundColor: SONGA_THEME.surfaceNatural,
  },
  buttonText: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    maxHeight: '85%',
    gap: SPACING.sm,
    padding: SPACING.lg,
    backgroundColor: SONGA_THEME.background,
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
    borderTopWidth: BORDERS.hard,
    borderColor: SONGA_THEME.textDark,
  },
  content: {
    gap: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    minHeight: 40,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.pill,
    borderWidth: BORDERS.hard,
    borderColor: SONGA_THEME.textDark,
  },
  chipSelected: {
    backgroundColor: SONGA_THEME.primaryAccent,
    borderColor: SONGA_THEME.primaryAccent,
  },
  note: {
    ...TYPOGRAPHY.body,
    minHeight: 72,
    padding: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
    textAlignVertical: 'top',
  },
});
