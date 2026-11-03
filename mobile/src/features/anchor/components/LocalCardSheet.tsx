import Ionicons from '@expo/vector-icons/Ionicons';
import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LanguagePicker, PrimaryButton, SongaText } from '@/components/ui';
import { findLanguage } from '@/config/languages';
import { BORDERS, RADII, SONGA_THEME, SPACING } from '@/theme';

import type { CardState } from '../hooks/useLocalCards';

interface LocalCardSheetProps {
  visible: boolean;
  onClose: () => void;
  state: CardState;
  /** Shown above the translated card, and on its own if the card is not ready yet. */
  fallback: { title: string; lines: string[] };
  locale: string;
  onLocaleChange: (locale: string) => void;
}

export function LocalCardSheet({ visible, onClose, state, fallback, locale, onLocaleChange }: LocalCardSheetProps) {
  const insets = useSafeAreaInsets();
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const card = state.card;
  const language = findLanguage(card?.target_locale ?? locale);

  useEffect(() => {
    if (!visible) void Speech.stop();
  }, [visible]);

  const say = (text: string) => {
    setSpeechError(null);
    void Speech.stop().then(() => {
      setSpeaking(text);
      Speech.speak(text, {
        language: language.locale,
        onDone: () => setSpeaking(null),
        onStopped: () => setSpeaking(null),
        onError: () => {
          setSpeaking(null);
          setSpeechError(`This phone has no ${language.label} voice. Show the text instead.`);
        },
      });
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + SPACING.md, paddingBottom: insets.bottom + SPACING.md }]}>
        <View style={styles.topRow}>
          <LanguagePicker caption="Local language" locale={locale} onChange={onLocaleChange} />
          <Pressable accessibilityRole="button" accessibilityLabel="Close card" onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={28} color={SONGA_THEME.textDark} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {card ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Read the card aloud"
                onPress={() => say(`${card.title_local}. ${card.body_local}`)}
                style={styles.hero}
              >
                <SongaText variant="display" selectable>
                  {card.title_local}
                </SongaText>
                <SongaText variant="title" style={styles.heroBody} selectable>
                  {card.body_local}
                </SongaText>
                <View style={styles.listen}>
                  <Ionicons name="volume-high" size={18} color={SONGA_THEME.primaryAccent} />
                  <SongaText variant="label" color="primaryAccent">
                    Tap to read aloud
                  </SongaText>
                </View>
              </Pressable>

              <View style={styles.meaning}>
                <SongaText variant="caption">What this says</SongaText>
                <SongaText variant="body">
                  {card.title_meaning}. {card.body_meaning}
                </SongaText>
                {fallback.lines.map((line) => (
                  <SongaText key={line} variant="caption" selectable>
                    {line}
                  </SongaText>
                ))}
              </View>

              {card.phrases.length > 0 ? (
                <View style={styles.phrases}>
                  <SongaText variant="label">Tap a phrase to say it</SongaText>
                  {card.phrases.map((phrase) => (
                    <Pressable
                      key={phrase.local}
                      accessibilityRole="button"
                      accessibilityLabel={`Say: ${phrase.meaning}`}
                      onPress={() => say(phrase.local)}
                      style={({ pressed }) => [styles.phrase, pressed || speaking === phrase.local ? styles.phraseActive : null]}
                    >
                      <View style={styles.phraseText}>
                        <SongaText variant="subtitle">{phrase.local}</SongaText>
                        <SongaText variant="caption">{phrase.meaning}</SongaText>
                      </View>
                      <Ionicons
                        name={speaking === phrase.local ? 'volume-high' : 'volume-medium-outline'}
                        size={22}
                        color={SONGA_THEME.primaryAccent}
                      />
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.hero}>
              <SongaText variant="display" selectable>
                {fallback.title}
              </SongaText>
              {fallback.lines.map((line) => (
                <SongaText key={line} variant="title" style={styles.heroBody} selectable>
                  {line}
                </SongaText>
              ))}
              {state.generating ? (
                <View style={styles.listen}>
                  <ActivityIndicator color={SONGA_THEME.primaryAccent} />
                  <SongaText variant="caption">Translating into {language.label}…</SongaText>
                </View>
              ) : (
                <SongaText variant="caption">
                  {state.error
                    ? `Not translated yet: ${state.error}`
                    : `Connect once and Songa translates this into ${language.label} and keeps it offline.`}
                </SongaText>
              )}
            </View>
          )}

          {speechError ? <SongaText variant="caption">{speechError}</SongaText> : null}
          {!card && !state.generating ? (
            <PrimaryButton label="Translate now" icon="refresh" variant="outline" onPress={state.retry} />
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SONGA_THEME.background,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  content: {
    gap: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  hero: {
    gap: SPACING.md,
    padding: SPACING.xl,
    borderRadius: RADII.lg,
    backgroundColor: SONGA_THEME.surfaceNatural,
    borderWidth: BORDERS.hard,
    borderColor: SONGA_THEME.textDark,
  },
  heroBody: {
    fontSize: 24,
    lineHeight: 34,
  },
  listen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  meaning: {
    gap: SPACING.xs,
  },
  phrases: {
    gap: SPACING.sm,
  },
  phrase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
    backgroundColor: SONGA_THEME.background,
  },
  phraseActive: {
    backgroundColor: SONGA_THEME.surfaceNatural,
  },
  phraseText: {
    flex: 1,
    gap: SPACING.xxs,
  },
});
