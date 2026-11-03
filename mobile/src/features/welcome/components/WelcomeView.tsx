import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { LanguagePicker, PrimaryButton, Screen, SongaText } from '@/components/ui';
import { findLanguage } from '@/config/languages';
import { usePreferences } from '@/storage/preferences';
import { SONGA_THEME, SPACING } from '@/theme';

const FEATURES: readonly { icon: ComponentProps<typeof Ionicons>['name']; title: string; body: string }[] = [
  { icon: 'airplane-outline', title: 'Trip', body: 'Plan your days and learn the phrases and manners before you go.' },
  { icon: 'chatbubbles-outline', title: 'Speak', body: 'Talk across the table. Songa says it the polite, local way.' },
  { icon: 'scan-outline', title: 'Look', body: 'Point at a menu or sign and tap what you want explained.' },
  { icon: 'book-outline', title: 'Journal', body: 'Drop notes and photos. Songa writes up your day.' },
  { icon: 'compass-outline', title: 'Anchor', body: 'Find your way back to where you stay, even offline.' },
];

export function WelcomeView() {
  const prefs = usePreferences();
  const visiting = findLanguage(prefs.residentLocale);

  return (
    <Screen title="Welcome to Songa" subtitle="Your companion for every conversation on the road" scrollable>
      <View style={styles.stack}>
        <View style={styles.pickers}>
          <LanguagePicker wide caption="I speak" locale={prefs.travelerLocale} onChange={prefs.setTravelerLocale} />
          <LanguagePicker
            wide
            caption="People where I'm going speak"
            locale={prefs.residentLocale}
            onChange={prefs.setResidentLocale}
          />
          <SongaText variant="caption">
            Prices are shown in {findLanguage(prefs.travelerLocale).currency}, and Songa phrases things the polite way
            people do in {visiting.country}. You can change both later on the Speak tab.
          </SongaText>
        </View>

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature.title} style={styles.feature}>
              <Ionicons name={feature.icon} size={24} color={SONGA_THEME.primaryAccent} />
              <View style={styles.featureText}>
                <SongaText variant="subtitle">{feature.title}</SongaText>
                <SongaText variant="body" color="textMuted">
                  {feature.body}
                </SongaText>
              </View>
            </View>
          ))}
        </View>

        <PrimaryButton label="Start" icon="arrow-forward" onPress={prefs.completeOnboarding} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: SPACING.xl,
  },
  pickers: {
    gap: SPACING.md,
  },
  features: {
    gap: SPACING.lg,
  },
  feature: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  featureText: {
    flex: 1,
    gap: SPACING.xxs,
  },
});
