import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, PrimaryButton, SongaText } from '@/components/ui';
import { BORDERS, RADII, SONGA_THEME, SPACING } from '@/theme';

interface VisionCameraProps {
  active: boolean;
  onPhoto: (uri: string) => void;
  onError: (message: string) => void;
}

export function VisionCamera({ active, onPhoto, onError }: VisionCameraProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const capture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.9, shutterSound: false });
      onPhoto(picture.uri);
    } catch {
      onError('The camera could not take a photo. Try again.');
    } finally {
      setCapturing(false);
    }
  };

  const pickFromLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      const asset = result.canceled ? null : result.assets[0];
      if (asset) onPhoto(asset.uri);
    } catch {
      onError('Your photo library could not be opened.');
    }
  };

  if (!permission) return <View style={styles.viewport} />;

  if (!permission.granted) {
    return (
      <Card tone="bordered" style={styles.permissionCard}>
        <Ionicons name="camera-outline" size={32} color={SONGA_THEME.textDark} />
        <SongaText variant="subtitle">Camera access needed</SongaText>
        <SongaText variant="body" color="textMuted">
          Point Songa at a menu, sign or transit board and tap whatever you want explained.
        </SongaText>
        <View style={styles.permissionActions}>
          {permission.canAskAgain ? (
            <PrimaryButton label="Allow camera" icon="camera" onPress={() => void requestPermission()} />
          ) : (
            <SongaText variant="caption">Enable camera access for Songa in your device settings.</SongaText>
          )}
          <PrimaryButton label="Use a saved photo" icon="images-outline" variant="outline" onPress={pickFromLibrary} />
        </View>
      </Card>
    );
  }

  return (
    <View style={styles.viewport}>
      {active ? (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} />
      ) : null}
      <View style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose from photo library" onPress={pickFromLibrary} style={styles.sideButton}>
          <Ionicons name="images-outline" size={22} color={SONGA_THEME.textDark} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          disabled={!ready || capturing}
          onPress={capture}
          style={({ pressed }) => [styles.shutter, pressed || capturing ? styles.shutterPressed : null]}
        >
          <View style={styles.shutterInner} />
        </Pressable>
        <View style={styles.sideButtonPlaceholder} />
      </View>
    </View>
  );
}

const SHUTTER = 72;

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    borderRadius: RADII.lg,
    overflow: 'hidden',
    backgroundColor: SONGA_THEME.textDark,
    justifyContent: 'flex-end',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
  },
  shutter: {
    width: SHUTTER,
    height: SHUTTER,
    borderRadius: SHUTTER / 2,
    borderWidth: 4,
    borderColor: SONGA_THEME.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterPressed: {
    borderColor: SONGA_THEME.secondaryAccent,
  },
  shutterInner: {
    width: SHUTTER - 16,
    height: SHUTTER - 16,
    borderRadius: (SHUTTER - 16) / 2,
    backgroundColor: SONGA_THEME.primaryAccent,
  },
  sideButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SONGA_THEME.background,
    borderWidth: BORDERS.hairline,
    borderColor: SONGA_THEME.textDark,
  },
  sideButtonPlaceholder: {
    width: 44,
  },
  permissionCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  permissionActions: {
    alignSelf: 'stretch',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
});
