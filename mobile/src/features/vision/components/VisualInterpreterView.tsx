import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ErrorBanner, PrimaryButton, Screen, SegmentedControl, SongaText } from '@/components/ui';
import type { SceneMode } from '@/services/api/vision';
import { RADII, SONGA_THEME, SPACING } from '@/theme';

import type { VisualInterpreter } from '../hooks/useVisualInterpreter';
import { AnalysisCard } from './AnalysisCard';
import { FoodNeedsButton } from './FoodNeedsSheet';
import { MenuCheckCard } from './MenuCheckCard';
import { SegmentedImage } from './SegmentedImage';
import { VisionCamera } from './VisionCamera';

const SCENES: readonly { value: SceneMode; label: string }[] = [
  { value: 'menu', label: 'Menu' },
  { value: 'signage', label: 'Signs' },
  { value: 'market', label: 'Market' },
  { value: 'general', label: 'Other' },
];

const BUSY_LABELS = {
  preparing: 'Getting the photo ready…',
  segmenting: 'Finding things you can tap…',
} as const;

interface VisualInterpreterViewProps {
  vision: VisualInterpreter;
  cameraActive: boolean;
}

export function VisualInterpreterView({ vision, cameraActive }: VisualInterpreterViewProps) {
  const showingPhoto = vision.capturedImage !== null && vision.stage !== 'camera';
  const busyLabel = vision.stage === 'preparing' || vision.stage === 'segmenting' ? BUSY_LABELS[vision.stage] : null;
  const showAnalysis = vision.stage === 'analyzing' || vision.selectedAnalysisData !== null;
  const showMenuCheck = vision.checkingMenu || vision.menuCheck !== null;
  const canCheckMenu = showingPhoto && vision.scene === 'menu' && !busyLabel && !showMenuCheck;
  const errorRetry = !showingPhoto
    ? undefined
    : vision.menuCheckFailed
      ? vision.runMenuCheck
      : vision.segmentationMasks.length === 0
        ? vision.retrySegmentation
        : undefined;

  return (
    <Screen
      title="Look"
      subtitle={showingPhoto ? 'Tap anything on the photo to have it explained' : 'Point at a menu, sign or price tag'}
      headerAccessory={
        showingPhoto && (showAnalysis || showMenuCheck) ? (
          <PrimaryButton label="Retake" icon="camera-outline" variant="outline" compact onPress={vision.retake} />
        ) : null
      }
    >
      {!showingPhoto ? <SegmentedControl options={SCENES} value={vision.scene} onChange={vision.setScene} /> : null}
      {!showingPhoto && vision.scene === 'menu' ? <FoodNeedsButton /> : null}

      <View style={styles.stage}>
        {showingPhoto && vision.capturedImage ? (
          <SegmentedImage
            uri={vision.capturedImage.uri}
            imageSize={vision.capturedImage}
            segments={vision.segmentationMasks}
            verdicts={vision.segmentVerdicts}
            selectedSegmentId={vision.selectedSegmentId}
            tapPoint={vision.tapPoint}
            onTapImagePoint={(point) => void vision.selectAt(point)}
          />
        ) : (
          <VisionCamera
            active={cameraActive && vision.stage === 'camera'}
            onPhoto={(uri) => void vision.processPhoto(uri)}
            onError={vision.reportError}
          />
        )}

        {busyLabel ? (
          <View style={styles.busyOverlay}>
            <ActivityIndicator color={SONGA_THEME.primaryAccent} size="large" />
            <SongaText variant="label">{busyLabel}</SongaText>
          </View>
        ) : null}
      </View>

      {vision.error ? (
        <ErrorBanner
          message={vision.error}
          onDismiss={vision.dismissError}
          onRetry={errorRetry}
        />
      ) : null}

      {showAnalysis ? (
        <AnalysisCard
          analysis={vision.selectedAnalysisData}
          loading={vision.stage === 'analyzing'}
          onClose={vision.clearSelection}
          onReadAloud={vision.readAloud}
        />
      ) : showMenuCheck ? (
        <MenuCheckCard
          result={vision.menuCheck}
          loading={vision.checkingMenu}
          selectedSegmentId={vision.selectedSegmentId}
          onSelectDish={vision.highlightSegment}
          onReadAloud={vision.readMenuSummary}
          onAskStaff={vision.speakStaffQuestion}
        />
      ) : showingPhoto && !busyLabel ? (
        <View style={styles.actions}>
          {canCheckMenu ? (
            vision.hasFoodNeeds ? (
              <PrimaryButton label="Check this menu for my needs" icon="restaurant-outline" onPress={vision.runMenuCheck} />
            ) : (
              <FoodNeedsButton />
            )
          ) : null}
          <PrimaryButton label="Take another photo" icon="camera-outline" variant="outline" onPress={vision.retake} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    marginVertical: SPACING.md,
  },
  actions: {
    gap: SPACING.sm,
  },
  busyOverlay: {
    position: 'absolute',
    left: SPACING.xl,
    right: SPACING.xl,
    top: '40%',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.lg,
    borderRadius: RADII.md,
    backgroundColor: SONGA_THEME.surfaceNatural,
  },
});
