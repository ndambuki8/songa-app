import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ErrorBanner, PrimaryButton, Screen, SegmentedControl, SongaText } from '@/components/ui';
import type { SceneMode } from '@/services/api/vision';
import { RADII, SONGA_THEME, SPACING } from '@/theme';

import type { VisualInterpreter } from '../hooks/useVisualInterpreter';
import { AnalysisCard } from './AnalysisCard';
import { SegmentedImage } from './SegmentedImage';
import { VisionCamera } from './VisionCamera';

const SCENES: readonly { value: SceneMode; label: string }[] = [
  { value: 'menu', label: 'Menu' },
  { value: 'signage', label: 'Signs' },
  { value: 'market', label: 'Market' },
  { value: 'general', label: 'Other' },
];

const BUSY_LABELS = {
  preparing: 'Preparing photo…',
  segmenting: 'Finding items with SAM 3.1…',
} as const;

interface VisualInterpreterViewProps {
  vision: VisualInterpreter;
  cameraActive: boolean;
}

export function VisualInterpreterView({ vision, cameraActive }: VisualInterpreterViewProps) {
  const showingPhoto = vision.capturedImage !== null && vision.stage !== 'camera';
  const busyLabel = vision.stage === 'preparing' || vision.stage === 'segmenting' ? BUSY_LABELS[vision.stage] : null;
  const showAnalysis = vision.stage === 'analyzing' || vision.selectedAnalysisData !== null;

  return (
    <Screen
      title="Look"
      subtitle={showingPhoto ? 'Tap any item to have it explained' : 'Snap a menu, sign or transit board'}
      headerAccessory={
        showingPhoto ? <PrimaryButton label="Retake" icon="camera-outline" variant="outline" compact onPress={vision.retake} /> : null
      }
    >
      {!showingPhoto ? <SegmentedControl options={SCENES} value={vision.scene} onChange={vision.setScene} /> : null}

      <View style={styles.stage}>
        {showingPhoto && vision.capturedImage ? (
          <SegmentedImage
            uri={vision.capturedImage.uri}
            imageSize={vision.capturedImage}
            segments={vision.segmentationMasks}
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
          onRetry={showingPhoto && vision.segmentationMasks.length === 0 ? vision.retrySegmentation : undefined}
        />
      ) : null}

      {showAnalysis ? (
        <AnalysisCard
          analysis={vision.selectedAnalysisData}
          loading={vision.stage === 'analyzing'}
          onClose={vision.clearSelection}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    marginVertical: SPACING.md,
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
