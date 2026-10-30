import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LANGUAGES, findLanguage } from '@/config/languages';
import { BORDERS, RADII, SONGA_THEME, SPACING } from '@/theme';

import { SongaText } from './SongaText';

interface LanguagePickerProps {
  caption: string;
  locale: string;
  onChange: (locale: string) => void;
}

export function LanguagePicker({ caption, locale, onChange }: LanguagePickerProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const current = findLanguage(locale);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${caption}: ${current.label}. Change language`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.chip, pressed ? styles.chipPressed : null]}
      >
        <SongaText variant="caption">{caption}</SongaText>
        <View style={styles.chipValue}>
          <SongaText variant="label">{current.label}</SongaText>
          <Ionicons name="chevron-down" size={14} color={SONGA_THEME.textDark} />
        </View>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close language list" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg }]}>
          <SongaText variant="title" style={styles.sheetTitle}>
            {caption}
          </SongaText>
          <FlatList
            data={LANGUAGES}
            keyExtractor={(item) => item.locale}
            renderItem={({ item }) => {
              const selected = item.locale === locale;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onChange(item.locale);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
                >
                  <View>
                    <SongaText variant="subtitle">{item.label}</SongaText>
                    <SongaText variant="caption">{item.country}</SongaText>
                  </View>
                  {selected ? <Ionicons name="checkmark-circle" size={22} color={SONGA_THEME.primaryAccent} /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADII.md,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
    backgroundColor: SONGA_THEME.background,
  },
  chipPressed: {
    backgroundColor: SONGA_THEME.surfaceNatural,
  },
  chipValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    maxHeight: '70%',
    backgroundColor: SONGA_THEME.background,
    borderTopLeftRadius: RADII.lg,
    borderTopRightRadius: RADII.lg,
    borderTopWidth: BORDERS.hard,
    borderColor: SONGA_THEME.textDark,
    paddingTop: SPACING.lg,
  },
  sheetTitle: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  rowPressed: {
    backgroundColor: SONGA_THEME.surfaceNatural,
  },
});
