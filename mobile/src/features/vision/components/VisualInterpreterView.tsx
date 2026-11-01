import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { ErrorBanner, PrimaryButton, Screen, SegmentedControl, SongaText } from '@/components/ui';
import type { SceneMode } from '@/services/api/vision';
import { RADII, SONGA_THEME, SPACING } from '@/theme';

import type { VisualInterpreter } from '../hooks/useVisualInterpreter';
import { AnalysisCard } from './AnalysisCard';
import { AnswerCard } from './AnswerCard';
import { AskBar } from './AskBar';
import { SegmentedImage } from './SegmentedImage';
import { VisionCamera } from './VisionCamera';

const SCENES: readonly { value: SceneMode; label: string }[] = [
  { value: 'menu', label: 'Menu' },
  { value: 'signage', label: 'Signs' },
  { value: 'market', label: 'Market' },
  { value: 'general', label: 'Places' },
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
  // One card at a time: a question's answer takes the place of the tap explanation until it is closed.
  const showAnswer = vision.asking || vision.answer !== null;
  const showAnalysis = !showAnswer && (vision.stage === 'analyzing' || vision.selectedAnalysisData !== null);
  const askDisabled = busyLabel !== null || vision.stage === 'analyzing' || vision.asking;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        title="Look"
        subtitle={showingPhoto ? 'Tap an item, or ask a question below' : 'Snap a menu, sign, market stall or place'}
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
              highlights={vision.highlights}
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

        {showAnswer ? (
          <AnswerCard
            answer={vision.answer}
            loading={vision.asking}
            highlightCount={vision.highlights.length}
            onClose={vision.closeAnswer}
          />
        ) : null}

        {showAnalysis ? (
          <AnalysisCard
            analysis={vision.selectedAnalysisData}
            loading={vision.stage === 'analyzing'}
            onClose={vision.clearSelection}
          />
        ) : null}

        {showingPhoto ? (
          <AskBar
            scene={vision.scene}
            hasSelection={vision.hasSelection}
            disabled={askDisabled}
            showSuggestions={!showAnswer && !showAnalysis}
            onAsk={(question) => void vision.ask(question)}
          />
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
