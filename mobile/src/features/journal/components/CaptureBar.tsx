import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Card, SongaText } from '@/components/ui';
import { BORDERS, RADII, SONGA_THEME, SPACING, TYPOGRAPHY } from '@/theme';

interface CaptureBarProps {
  recording: boolean;
  recordingDurationMs: number;
  onSubmitNote: (text: string) => void;
  onToggleMemo: () => void;
  onTakePhoto: () => void;
  onPickPhoto: () => void;
}

export function CaptureBar({
  recording,
  recordingDurationMs,
  onSubmitNote,
  onToggleMemo,
  onTakePhoto,
  onPickPhoto,
}: CaptureBarProps) {
  const [draft, setDraft] = useState('');

  const submit = () => {
    if (!draft.trim()) return;
    onSubmitNote(draft);
    setDraft('');
  };

  return (
    <Card style={styles.card}>
      <View style={styles.inputRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Jot a quick note…"
          placeholderTextColor={SONGA_THEME.textMuted}
          style={styles.input}
          multiline
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={submit}
          accessibilityLabel="Journal note"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save note"
          disabled={!draft.trim()}
          onPress={submit}
          style={[styles.send, !draft.trim() ? styles.sendDisabled : null]}
        >
          <Ionicons name="arrow-up" size={18} color={SONGA_THEME.background} />
        </Pressable>
      </View>

      <View style={styles.actions}>
        <CaptureAction
          icon={recording ? 'stop-circle' : 'mic-outline'}
          label={recording ? `Stop ${Math.floor(recordingDurationMs / 1000)}s` : 'Voice memo'}
          active={recording}
          onPress={onToggleMemo}
        />
        <CaptureAction icon="camera-outline" label="Photo" onPress={onTakePhoto} disabled={recording} />
        <CaptureAction icon="images-outline" label="Library" onPress={onPickPhoto} disabled={recording} />
      </View>
    </Card>
  );
}

interface CaptureActionProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}

function CaptureAction({ icon, label, onPress, active = false, disabled = false }: CaptureActionProps) {
  const foreground = active ? SONGA_THEME.background : SONGA_THEME.textDark;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        active ? styles.actionActive : null,
        pressed && !active ? styles.actionPressed : null,
        disabled ? styles.actionDisabled : null,
      ]}
    >
      <Ionicons name={icon} size={18} color={foreground} />
      <SongaText variant="label" style={{ color: foreground }}>
        {label}
      </SongaText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: SPACING.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.sm,
  },
  input: {
    ...TYPOGRAPHY.body,
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.md,
    backgroundColor: SONGA_THEME.background,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SONGA_THEME.primaryAccent,
  },
  sendDisabled: {
    opacity: 0.4,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    minHeight: 40,
    borderRadius: RADII.pill,
    backgroundColor: SONGA_THEME.background,
  },
  actionActive: {
    backgroundColor: SONGA_THEME.secondaryAccent,
  },
  actionPressed: {
    backgroundColor: SONGA_THEME.surfaceNatural,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
  },
  actionDisabled: {
    opacity: 0.4,
  },
});
