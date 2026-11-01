import { useCallback, useRef, useState } from 'react';

import { prepareImageForUpload, type PreparedImage } from '@/lib/imagePreparation';
import { smallestContaining, type Point } from '@/lib/imageScaling';
import { approximateCoordinates } from '@/lib/location';
import type { BoundingBox, IsolateResponse, Segment } from '@/services/api/schemas';
import {
  askAboutPhoto,
  requestSegmentAnalysis,
  requestSegmentation,
  type AskAnswer,
  type AskRequest,
  type SceneMode,
} from '@/services/api/vision';
import { usePreferences } from '@/storage/preferences';

const UPLOAD_MAX_EDGE = 1536;

export type VisionStage = 'camera' | 'preparing' | 'segmenting' | 'ready' | 'analyzing';

export interface PhotoAnswer extends AskAnswer {
  question: string;
  /** True while SAM 3.1 is still looking for the things the answer mentions. */
  highlightsPending: boolean;
}

export function useVisualInterpreter() {
  const { travelerLocale, homeCurrency, needsSummary: needs } = usePreferences();
  const [scene, setScene] = useState<SceneMode>('menu');
  const [stage, setStage] = useState<VisionStage>('camera');
  const [capturedImage, setCapturedImage] = useState<PreparedImage | null>(null);
  const [imageId, setImageId] = useState<string | null>(null);
  const [segmentationMasks, setSegmentationMasks] = useState<Segment[]>([]);
  const [tapPoint, setTapPoint] = useState<Point | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedAnalysisData, setSelectedAnalysisData] = useState<IsolateResponse | null>(null);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<PhotoAnswer | null>(null);
  const [highlights, setHighlights] = useState<Segment[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Bumped by every tap, question, close or retake so late responses from older requests are ignored. */
  const analysisRequest = useRef(0);

  const clearAnswer = useCallback(() => {
    setAnswer(null);
    setHighlights([]);
    setAsking(false);
  }, []);

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
        setError('No distinct items were found. You can still tap anywhere or ask a question.');
      }
      setStage('ready');
    },
    [scene],
  );

  const processPhoto = useCallback(
    async (sourceUri: string) => {
      analysisRequest.current++;
      setError(null);
      setSelectedAnalysisData(null);
      setSelectedSegmentId(null);
      setTapPoint(null);
      setSegmentationMasks([]);
      setImageId(null);
      clearAnswer();
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
    [clearAnswer, segment],
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
      clearAnswer();
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
        needs,
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
    [capturedImage, clearAnswer, homeCurrency, imageId, needs, scene, segmentationMasks, stage, travelerLocale],
  );

  /** The tapped item, if any, so "this" in a question refers to it. */
  const focusBox = useCallback((): BoundingBox | null => {
    if (!tapPoint) return null;
    if (selectedAnalysisData) return selectedAnalysisData.segment_bbox;
    return segmentationMasks.find((item) => item.id === selectedSegmentId)?.bbox ?? null;
  }, [segmentationMasks, selectedAnalysisData, selectedSegmentId, tapPoint]);

  const ask = useCallback(
    async (rawQuestion: string) => {
      const question = rawQuestion.trim();
      if (!question || !capturedImage || stage === 'segmenting' || stage === 'preparing' || stage === 'analyzing') return;
      const requestId = ++analysisRequest.current;
      const isCurrent = () => requestId === analysisRequest.current;
      setError(null);
      setAnswer(null);
      setHighlights([]);
      setAsking(true);

      // Location grounds "where am I?" answers. Only the Places scene asks for permission; elsewhere it is used
      // if the traveler already granted it (for example for Anchor).
      const coordinates = await approximateCoordinates({ prompt: scene === 'general' });
      if (!isCurrent()) return;

      const request: AskRequest = {
        imageId,
        question,
        focus: focusBox(),
        travelerLocale,
        homeCurrency,
        scene,
        coordinates,
        needs,
      };
      const handlers = {
        onAnswer: (reply: AskAnswer) => {
          if (!isCurrent()) return;
          setAsking(false);
          setAnswer({ ...reply, question, highlightsPending: reply.find.length > 0 });
        },
        onHighlights: (segments: Segment[]) => {
          if (!isCurrent()) return;
          setHighlights(segments);
          setAnswer((current) => (current ? { ...current, highlightsPending: false } : current));
        },
      };

      let result = imageId
        ? await askAboutPhoto(request, handlers)
        : await askAboutPhoto({ ...request, imageBase64: capturedImage.base64 }, handlers);
      if (!result.ok && result.error.kind === 'expired' && isCurrent()) {
        result = await askAboutPhoto({ ...request, imageBase64: capturedImage.base64 }, handlers);
      }
      if (!isCurrent()) return;

      setAsking(false);
      setAnswer((current) => (current ? { ...current, highlightsPending: false } : current));
      if (!result.ok) setError(result.error.message);
    },
    [capturedImage, focusBox, homeCurrency, imageId, needs, scene, stage, travelerLocale],
  );

  const closeAnswer = useCallback(() => {
    analysisRequest.current++;
    clearAnswer();
  }, [clearAnswer]);

  const clearSelection = useCallback(() => {
    analysisRequest.current++;
    setSelectedAnalysisData(null);
    setSelectedSegmentId(null);
    setTapPoint(null);
    clearAnswer();
    if (stage === 'analyzing') setStage('ready');
  }, [clearAnswer, stage]);

  const retake = useCallback(() => {
    analysisRequest.current++;
    setCapturedImage(null);
    setImageId(null);
    setSegmentationMasks([]);
    setSelectedAnalysisData(null);
    setSelectedSegmentId(null);
    setTapPoint(null);
    clearAnswer();
    setError(null);
    setStage('camera');
  }, [clearAnswer]);

  return {
    scene,
    setScene,
    stage,
    capturedImage,
    capturedImageURI: capturedImage?.uri ?? null,
    segmentationMasks,
    selectedSegmentId,
    hasSelection: tapPoint !== null,
    tapPoint,
    selectedAnalysisData,
    asking,
    answer,
    highlights,
    error,
    dismissError: () => setError(null),
    reportError: setError,
    processPhoto,
    retrySegmentation,
    selectAt,
    ask,
    closeAnswer,
    clearSelection,
    retake,
  };
}

export type VisualInterpreter = ReturnType<typeof useVisualInterpreter>;
