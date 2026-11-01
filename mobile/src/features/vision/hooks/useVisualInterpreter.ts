import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';

import { prepareImageForUpload, type PreparedImage } from '@/lib/imagePreparation';
import { smallestContaining, type Point } from '@/lib/imageScaling';
import type { IsolateResponse, Segment } from '@/services/api/schemas';
import { requestSegmentAnalysis, requestSegmentation, type SceneMode } from '@/services/api/vision';
import { usePreferences } from '@/storage/preferences';

const UPLOAD_MAX_EDGE = 1536;

export type VisionStage = 'camera' | 'preparing' | 'segmenting' | 'ready' | 'analyzing';

export function useVisualInterpreter() {
  const { travelerLocale, homeCurrency } = usePreferences();
  const [scene, setScene] = useState<SceneMode>('menu');
  const [stage, setStage] = useState<VisionStage>('camera');
  const [capturedImage, setCapturedImage] = useState<PreparedImage | null>(null);
  const [imageId, setImageId] = useState<string | null>(null);
  const [segmentationMasks, setSegmentationMasks] = useState<Segment[]>([]);
  const [tapPoint, setTapPoint] = useState<Point | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedAnalysisData, setSelectedAnalysisData] = useState<IsolateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const analysisRequest = useRef(0);

  useEffect(() => () => void Speech.stop(), []);

  const segment = useCallback(
    async (image: PreparedImage) => {
      setStage('segmenting');
      const result = await requestSegmentation(image.base64, scene);
      if (!result.ok) {
        setError(result.error.message);
        setStage('ready');
        return;
      }
      setImageId(result.data.image_id);
      setSegmentationMasks(result.data.segments);
      if (result.data.segments.length === 0) {
        setError('No items stood out. You can still tap anything on the photo.');
      }
      setStage('ready');
    },
    [scene],
  );

  const processPhoto = useCallback(
    async (sourceUri: string) => {
      setError(null);
      setSelectedAnalysisData(null);
      setSelectedSegmentId(null);
      setTapPoint(null);
      setSegmentationMasks([]);
      setImageId(null);
      setStage('preparing');
      try {
        const prepared = await prepareImageForUpload(sourceUri, UPLOAD_MAX_EDGE);
        setCapturedImage(prepared);
        await segment(prepared);
      } catch {
        setError('That photo could not be processed. Try taking it again.');
        setStage('camera');
      }
    },
    [segment],
  );

  const retrySegmentation = useCallback(() => {
    if (!capturedImage) return;
    setError(null);
    void segment(capturedImage);
  }, [capturedImage, segment]);

  const selectAt = useCallback(
    async (point: Point) => {
      if (!capturedImage || stage === 'segmenting' || stage === 'preparing') return;
      const requestId = ++analysisRequest.current;
      setError(null);
      setTapPoint(point);
      setSelectedSegmentId(smallestContaining(segmentationMasks, point)?.id ?? null);
      setSelectedAnalysisData(null);
      setStage('analyzing');

      const baseRequest = {
        clickX: point.x,
        clickY: point.y,
        travelerLocale,
        homeCurrency,
        scene,
      };
      let result = imageId
        ? await requestSegmentAnalysis({ ...baseRequest, imageId })
        : await requestSegmentAnalysis({ ...baseRequest, imageId: '', imageBase64: capturedImage.base64 });
      if (!result.ok && result.error.kind === 'expired') {
        result = await requestSegmentAnalysis({ ...baseRequest, imageId: '', imageBase64: capturedImage.base64 });
      }
      if (requestId !== analysisRequest.current) return;

      setStage('ready');
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setSelectedAnalysisData(result.data);
    },
    [capturedImage, homeCurrency, imageId, scene, segmentationMasks, stage, travelerLocale],
  );

  const readAloud = useCallback(() => {
    if (!selectedAnalysisData) return;
    const { detected_object, safety_precautions, price_breakdown, contextual_description } = selectedAnalysisData;
    const script = [detected_object, ...safety_precautions, price_breakdown, contextual_description].filter(Boolean).join('. ');
    void Speech.stop().then(() => Speech.speak(script, { language: travelerLocale }));
  }, [selectedAnalysisData, travelerLocale]);

  const clearSelection = useCallback(() => {
    void Speech.stop();
    analysisRequest.current++;
    setSelectedAnalysisData(null);
    setSelectedSegmentId(null);
    setTapPoint(null);
    if (stage === 'analyzing') setStage('ready');
  }, [stage]);

  const retake = useCallback(() => {
    void Speech.stop();
    analysisRequest.current++;
    setCapturedImage(null);
    setImageId(null);
    setSegmentationMasks([]);
    setSelectedAnalysisData(null);
    setSelectedSegmentId(null);
    setTapPoint(null);
    setError(null);
    setStage('camera');
  }, []);

  return {
    scene,
    setScene,
    stage,
    capturedImage,
    capturedImageURI: capturedImage?.uri ?? null,
    segmentationMasks,
    selectedSegmentId,
    tapPoint,
    selectedAnalysisData,
    error,
    dismissError: () => setError(null),
    reportError: setError,
    processPhoto,
    retrySegmentation,
    selectAt,
    readAloud,
    clearSelection,
    retake,
  };
}

export type VisualInterpreter = ReturnType<typeof useVisualInterpreter>;
