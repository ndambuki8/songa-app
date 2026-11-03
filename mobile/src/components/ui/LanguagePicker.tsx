import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { findLanguage, searchLanguages } from '@/config/languages';
import { BORDERS, RADII, SONGA_THEME, SPACING, TYPOGRAPHY } from '@/theme';

import { SongaText } from './SongaText';

interface LanguagePickerProps {
  caption: string;
  locale: string;
  onChange: (locale: string) => void;
  /** Full-width field style, used on the welcome screen. */
  wide?: boolean;
}

export function LanguagePicker({ caption, locale, onChange, wide = false }: LanguagePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const current = findLanguage(locale);
  const results = useMemo(() => searchLanguages(query), [query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${caption}: ${current.label}. Change language`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.chip, wide ? styles.chipWide : null, pressed ? styles.chipPressed : null]}
      >
        <SongaText variant="caption">{caption}</SongaText>
        <View style={styles.chipValue}>
          <SongaText variant={wide ? 'subtitle' : 'label'} style={wide ? styles.chipValueText : null}>
            {current.label}
          </SongaText>
          <Ionicons name="chevron-down" size={wide ? 18 : 14} color={SONGA_THEME.textDark} />
        </View>
        {wide ? <SongaText variant="caption">{current.country}</SongaText> : null}
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close language list" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg }]}>
          <SongaText variant="title" style={styles.sheetTitle}>
            {caption}
          </SongaText>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={SONGA_THEME.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search language or country"
              placeholderTextColor={SONGA_THEME.textMuted}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Search languages"
            />
          </View>
          <FlatList
            data={results}
            keyExtractor={(item) => item.locale}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <SongaText variant="body" color="textMuted" style={styles.empty}>
                No match. Try the country name.
              </SongaText>
            }
            renderItem={({ item }) => {
              const selected = item.locale === locale;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onChange(item.locale);
                    close();
                  }}
                  style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
                >
                  <View style={styles.rowText}>
                    <SongaText variant="subtitle">{item.label}</SongaText>
                    <SongaText variant="caption">
                      {item.englishName} · {item.country}
                    </SongaText>
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
  chipWide: {
    alignSelf: 'stretch',
    paddingVertical: SPACING.md,
    gap: SPACING.xxs,
  },
  chipPressed: {
    backgroundColor: SONGA_THEME.surfaceNatural,
  },
  chipValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  chipValueText: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    height: '85%',
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
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
  },
  searchInput: {
    ...TYPOGRAPHY.body,
    flex: 1,
    minHeight: 44,
  },
  empty: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  rowText: {
    flex: 1,
  },
  rowPressed: {
    backgroundColor: SONGA_THEME.surfaceNatural,
  },
});
