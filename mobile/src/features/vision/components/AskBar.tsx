import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { SongaText } from '@/components/ui';
import type { SceneMode } from '@/services/api/vision';
import { BORDERS, RADII, SONGA_THEME, SPACING, TYPOGRAPHY } from '@/theme';

const PHOTO_SUGGESTIONS: Record<SceneMode, readonly string[]> = {
  menu: ['What do you recommend?', 'Which dishes are vegetarian?', 'What is the cheapest?'],
  signage: ['What does this say?', 'Which way should I go?'],
  market: ['Is this a fair price?', 'What is this used for?'],
  general: ['Where am I?', 'What is the history here?', 'What should I know here?'],
};

const ITEM_SUGGESTIONS: readonly string[] = ['Tell me more about this', 'What is the history of this?'];

interface AskBarProps {
  scene: SceneMode;
  /** An item is tapped, so questions are about it rather than the whole photo. */
  hasSelection: boolean;
  /** Something was already asked or explained about this photo, so the next question is a follow-up. */
  followUp: boolean;
  disabled: boolean;
  /** Suggestions are hidden while an answer or explanation card is open, to keep the photo visible. */
  showSuggestions: boolean;
  onAsk: (question: string) => void;
}

export function AskBar({ scene, hasSelection, followUp, disabled, showSuggestions, onAsk }: AskBarProps) {
  const [draft, setDraft] = useState('');
  const suggestions = hasSelection ? ITEM_SUGGESTIONS : PHOTO_SUGGESTIONS[scene];
  const canSend = !disabled && draft.trim().length > 0;

  const send = (question: string) => {
    if (disabled || !question.trim()) return;
    onAsk(question);
    setDraft('');
  };

  return (
    <View style={styles.root}>
      {showSuggestions && !draft ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          {suggestions.map((suggestion) => (
            <Pressable
              key={suggestion}
              accessibilityRole="button"
              accessibilityLabel={`Ask: ${suggestion}`}
              disabled={disabled}
              onPress={() => send(suggestion)}
              style={({ pressed }) => [styles.chip, pressed ? styles.chipPressed : null, disabled ? styles.disabled : null]}
            >
              <SongaText variant="label">{suggestion}</SongaText>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.inputRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={followUp ? 'Ask a follow-up…' : hasSelection ? 'Ask about the selected item…' : 'Ask about this photo…'}
          placeholderTextColor={SONGA_THEME.textMuted}
          style={styles.input}
          editable={!disabled}
          returnKeyType="send"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={() => send(draft)}
          maxLength={300}
          accessibilityLabel={hasSelection ? 'Question about the selected item' : 'Question about the photo'}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask"
          disabled={!canSend}
          onPress={() => send(draft)}
          style={[styles.send, !canSend ? styles.disabled : null]}
        >
          <Ionicons name="arrow-up" size={18} color={SONGA_THEME.background} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  chips: {
    gap: SPACING.sm,
  },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.pill,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
    backgroundColor: SONGA_THEME.background,
  },
  chipPressed: {
    backgroundColor: SONGA_THEME.surfaceNatural,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  input: {
    ...TYPOGRAPHY.body,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.pill,
    backgroundColor: SONGA_THEME.background,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SONGA_THEME.primaryAccent,
  },
  disabled: {
    opacity: 0.4,
  },
});
