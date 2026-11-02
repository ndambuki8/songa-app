import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { prepareImageForUpload, type PreparedImage } from '@/lib/imagePreparation';
import { smallestContaining, type Point } from '@/lib/imageScaling';
import type { IsolateResponse, MenuCheckResponse, Segment } from '@/services/api/schemas';
import { requestMenuCheck, requestSegmentAnalysis, requestSegmentation, type SceneMode } from '@/services/api/vision';
import { usePreferences } from '@/storage/preferences';

import { describeFoodNeeds, verdictBySegment } from '../foodNeeds';

const UPLOAD_MAX_EDGE = 1536;

export type VisionStage = 'camera' | 'preparing' | 'segmenting' | 'ready' | 'analyzing';

function speak(text: string, language: string) {
  void Speech.stop().then(() => Speech.speak(text, { language }));
}

export function useVisualInterpreter() {
  const { travelerLocale, residentLocale, homeCurrency, foodNeeds } = usePreferences();
  const [scene, setScene] = useState<SceneMode>('menu');
  const [stage, setStage] = useState<VisionStage>('camera');
  const [capturedImage, setCapturedImage] = useState<PreparedImage | null>(null);
  const [imageId, setImageId] = useState<string | null>(null);
  const [segmentationMasks, setSegmentationMasks] = useState<Segment[]>([]);
  const [tapPoint, setTapPoint] = useState<Point | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedAnalysisData, setSelectedAnalysisData] = useState<IsolateResponse | null>(null);
  const [menuCheck, setMenuCheck] = useState<MenuCheckResponse | null>(null);
  const [checkingMenu, setCheckingMenu] = useState(false);
  const [menuCheckFailed, setMenuCheckFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analysisRequest = useRef(0);
  const menuRequest = useRef(0);

  const needsText = describeFoodNeeds(foodNeeds);

  useEffect(() => () => void Speech.stop(), []);

  const checkMenu = useCallback(
    async (image: PreparedImage, cachedImageId: string | null, segments: readonly Segment[]) => {
      if (!needsText) return;
      const requestId = ++menuRequest.current;
      setCheckingMenu(true);
      setMenuCheckFailed(false);
      setMenuCheck(null);

      const base = { segments, needs: needsText, travelerLocale, localLocale: residentLocale };
      let result = await requestMenuCheck(cachedImageId ? { ...base, imageId: cachedImageId } : { ...base, imageId: null, imageBase64: image.base64 });
      if (!result.ok && result.error.kind === 'expired') {
        result = await requestMenuCheck({ ...base, imageId: null, imageBase64: image.base64 });
      }
      if (requestId !== menuRequest.current) return;

      setCheckingMenu(false);
      if (!result.ok) {
        setMenuCheckFailed(true);
        setError(result.error.message);
        return;
      }
      setMenuCheck(result.data);
      const hasAvoid = result.data.dishes.some((dish) => dish.verdict === 'avoid');
      void Haptics.notificationAsync(hasAvoid ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
      speak(result.data.spoken_summary, travelerLocale);
    },
    [needsText, residentLocale, travelerLocale],
  );

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
      setStage('ready');
      if (scene === 'menu' && needsText) {
        void checkMenu(image, result.data.image_id, result.data.segments);
      } else if (result.data.segments.length === 0) {
        setError('No items stood out. You can still tap anything on the photo.');
      }
    },
    [checkMenu, needsText, scene],
  );

  const processPhoto = useCallback(
    async (sourceUri: string) => {
      menuRequest.current++;
      setError(null);
      setSelectedAnalysisData(null);
      setSelectedSegmentId(null);
      setTapPoint(null);
      setSegmentationMasks([]);
      setImageId(null);
      setMenuCheck(null);
      setCheckingMenu(false);
      setMenuCheckFailed(false);
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

  const runMenuCheck = useCallback(() => {
    if (!capturedImage) return;
    setError(null);
    void checkMenu(capturedImage, imageId, segmentationMasks);
  }, [capturedImage, checkMenu, imageId, segmentationMasks]);

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
    speak(script, travelerLocale);
  }, [selectedAnalysisData, travelerLocale]);

  const readMenuSummary = useCallback(() => {
    if (menuCheck) speak(menuCheck.spoken_summary, travelerLocale);
  }, [menuCheck, travelerLocale]);

  const speakStaffQuestion = useCallback(() => {
    if (menuCheck?.staff_question) speak(menuCheck.staff_question, residentLocale);
  }, [menuCheck, residentLocale]);

  const highlightSegment = useCallback((segmentId: string | null) => {
    setTapPoint(null);
    setSelectedSegmentId((current) => (segmentId === current ? null : segmentId));
  }, []);

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
    menuRequest.current++;
    setCapturedImage(null);
    setImageId(null);
    setSegmentationMasks([]);
    setSelectedAnalysisData(null);
    setSelectedSegmentId(null);
    setTapPoint(null);
    setMenuCheck(null);
    setCheckingMenu(false);
    setMenuCheckFailed(false);
    setError(null);
    setStage('camera');
  }, []);

  const segmentVerdicts = useMemo(() => verdictBySegment(menuCheck?.dishes ?? []), [menuCheck]);

  return {
    scene,
    setScene,
    stage,
    capturedImage,
    capturedImageURI: capturedImage?.uri ?? null,
    segmentationMasks,
    segmentVerdicts,
    selectedSegmentId,
    tapPoint,
    selectedAnalysisData,
    menuCheck,
    checkingMenu,
    menuCheckFailed,
    hasFoodNeeds: needsText.length > 0,
    error,
    dismissError: () => setError(null),
    reportError: setError,
    processPhoto,
    retrySegmentation,
    runMenuCheck,
    selectAt,
    readAloud,
    readMenuSummary,
    speakStaffQuestion,
    highlightSegment,
    clearSelection,
    retake,
  };
}

export type VisualInterpreter = ReturnType<typeof useVisualInterpreter>;
