import { useCallback, useRef, useState } from 'react';

import { prepareImageForUpload, type PreparedImage } from '@/lib/imagePreparation';
import { smallestContaining, type Point } from '@/lib/imageScaling';
import { currentPlace, type CurrentPlace } from '@/lib/location';
import type { AskPoint, BoundingBox, IsolateResponse, Segment } from '@/services/api/schemas';
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

/**
 * One step of the conversation about the current photo. `explain` turns come from tapping an item, `ask` turns
 * from typed questions; both are remembered so follow-ups like "is it spicy?" make sense.
 */
export interface ThreadTurn {
  id: number;
  kind: 'ask' | 'explain';
  question: string;
  title: string | null;
  /** Null while the answer is still on its way. */
  answer: string | null;
  /** Optional: turns created before structured answers existed (or kept across a hot reload) lack them. */
  points?: AskPoint[];
  alerts?: string[];
  latencyMs: number | null;
  /** True while SAM 3.1 is still looking for the things the answer mentions. */
  highlightsPending: boolean;
}

/** The full answer as plain text, so follow-ups like "the second one" can refer to a listed option. */
function historyText(turn: ThreadTurn & { answer: string }): string {
  const { points = [], alerts = [] } = turn;
  const lines = [turn.answer];
  points.forEach((point, index) => {
    const price = point.price ? ` (${point.price})` : '';
    lines.push(`${index + 1}. ${point.label}${price}${point.text ? `: ${point.text}` : ''}`);
  });
  if (alerts.length > 0) lines.push(`Warnings: ${alerts.join('; ')}`);
  return lines.join('\n');
}

function explainTurnText(analysis: IsolateResponse): string {
  const parts = [analysis.contextual_description];
  if (analysis.price_breakdown) parts.push(`Price: ${analysis.price_breakdown}`);
  if (analysis.safety_precautions.length > 0) parts.push(`Heads up: ${analysis.safety_precautions.join('; ')}`);
  return parts.join(' ');
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
  const [thread, setThread] = useState<ThreadTurn[]>([]);
  const [threadOpen, setThreadOpen] = useState(false);
  const [highlights, setHighlights] = useState<Segment[]>([]);
  const [place, setPlace] = useState<CurrentPlace | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Bumped by every tap, question, close or retake so late responses from older requests are ignored. */
  const analysisRequest = useRef(0);
  const nextTurnId = useRef(1);
  /** Resolves to where the current photo was taken; started when the photo is taken, reused by every request. */
  const placeRequest = useRef<Promise<CurrentPlace | null>>(Promise.resolve(null));
  const threadRef = useRef<ThreadTurn[]>([]);

  const updateThread = useCallback((update: (current: ThreadTurn[]) => ThreadTurn[]) => {
    setThread((current) => {
      const next = update(current);
      threadRef.current = next;
      return next;
    });
  }, []);

  const resetConversation = useCallback(() => {
    threadRef.current = [];
    setThread([]);
    setThreadOpen(false);
    setHighlights([]);
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
      resetConversation();
      setPlace(null);
      // Location is looked up in parallel with segmentation, so taps and questions never wait for it.
      placeRequest.current = currentPlace({ prompt: true }).then((found) => {
        setPlace(found);
        return found;
      });
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
    [resetConversation, segment],
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
      setThreadOpen(false);
      setHighlights([]);
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
        place: await placeRequest.current,
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
      const analysis = result.data;
      // The explanation becomes part of the conversation, so "is it spicy?" right after refers to this item.
      updateThread((current) => [
        ...current,
        {
          id: nextTurnId.current++,
          kind: 'explain',
          question: `What is this? (tapped: ${analysis.detected_object})`,
          title: analysis.detected_object,
          answer: explainTurnText(analysis),
          points: [],
          alerts: [],
          latencyMs: analysis.latency_ms,
          highlightsPending: false,
        },
      ]);
    },
    [capturedImage, homeCurrency, imageId, needs, scene, segmentationMasks, stage, travelerLocale, updateThread],
  );

  /** The tapped item, if any, so "this" in a question refers to it. */
  const focusBox = useCallback((): BoundingBox | null => {
    if (!tapPoint) return null;
    if (selectedAnalysisData) return selectedAnalysisData.segment_bbox;
    return segmentationMasks.find((item) => item.id === selectedSegmentId)?.bbox ?? null;
  }, [segmentationMasks, selectedAnalysisData, selectedSegmentId, tapPoint]);

  const asking = thread.some((turn) => turn.kind === 'ask' && turn.answer === null);

  const ask = useCallback(
    async (rawQuestion: string) => {
      const question = rawQuestion.trim();
      if (!question || !capturedImage || stage === 'segmenting' || stage === 'preparing' || stage === 'analyzing') return;
      if (threadRef.current.some((turn) => turn.answer === null)) return;
      const requestId = ++analysisRequest.current;
      const isCurrent = () => requestId === analysisRequest.current;
      const turnId = nextTurnId.current++;
      // Everything already answered about this photo, oldest first.
      const history = threadRef.current
        .filter((turn): turn is ThreadTurn & { answer: string } => turn.answer !== null)
        .map((turn) => ({ question: turn.question, answer: historyText(turn) }));

      setError(null);
      setHighlights([]);
      setThreadOpen(true);
      updateThread((current) => [
        ...current,
        {
          id: turnId,
          kind: 'ask',
          question,
          title: null,
          answer: null,
          points: [],
          alerts: [],
          latencyMs: null,
          highlightsPending: false,
        },
      ]);

      const request: AskRequest = {
        imageId,
        question,
        focus: focusBox(),
        travelerLocale,
        homeCurrency,
        scene,
        place: await placeRequest.current,
        needs,
        history,
      };
      if (!isCurrent()) return;

      const patchTurn = (patch: Partial<ThreadTurn>) =>
        updateThread((current) => current.map((turn) => (turn.id === turnId ? { ...turn, ...patch } : turn)));
      const handlers = {
        onAnswer: (reply: AskAnswer) => {
          if (!isCurrent()) return;
          patchTurn({
            title: reply.title,
            answer: reply.answer,
            points: reply.points,
            alerts: reply.alerts,
            latencyMs: reply.latencyMs,
            highlightsPending: reply.find.length > 0,
          });
        },
        onHighlights: (segments: Segment[]) => {
          if (!isCurrent()) return;
          setHighlights(segments);
          patchTurn({ highlightsPending: false });
        },
      };

      let result = imageId
        ? await askAboutPhoto(request, handlers)
        : await askAboutPhoto({ ...request, imageBase64: capturedImage.base64 }, handlers);
      if (!result.ok && result.error.kind === 'expired' && isCurrent()) {
        result = await askAboutPhoto({ ...request, imageBase64: capturedImage.base64 }, handlers);
      }
      if (!isCurrent()) return;

      patchTurn({ highlightsPending: false });
      if (!result.ok) {
        // A failed question is dropped from the conversation so it is not sent as history later.
        updateThread((current) => current.filter((turn) => turn.id !== turnId || turn.answer !== null));
        setError(result.error.message);
      }
    },
    [capturedImage, focusBox, homeCurrency, imageId, needs, scene, stage, travelerLocale, updateThread],
  );

  /** Hides the conversation to show the photo. What was said is kept for follow-ups. */
  const closeAnswer = useCallback(() => {
    analysisRequest.current++;
    updateThread((current) => current.filter((turn) => turn.answer !== null));
    setThreadOpen(false);
    setHighlights([]);
  }, [updateThread]);

  /** Forgets the conversation about this photo, so the next question starts fresh. */
  const startOver = useCallback(() => {
    analysisRequest.current++;
    resetConversation();
  }, [resetConversation]);

  const clearSelection = useCallback(() => {
    analysisRequest.current++;
    setSelectedAnalysisData(null);
    setSelectedSegmentId(null);
    setTapPoint(null);
    setHighlights([]);
    if (stage === 'analyzing') setStage('ready');
  }, [stage]);

  const retake = useCallback(() => {
    analysisRequest.current++;
    setCapturedImage(null);
    setImageId(null);
    setSegmentationMasks([]);
    setSelectedAnalysisData(null);
    setSelectedSegmentId(null);
    setTapPoint(null);
    resetConversation();
    setPlace(null);
    setError(null);
    setStage('camera');
  }, [resetConversation]);

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
    thread,
    threadOpen,
    hasConversation: thread.some((turn) => turn.answer !== null),
    asking,
    highlights,
    place,
    error,
    dismissError: () => setError(null),
    reportError: setError,
    processPhoto,
    retrySegmentation,
    selectAt,
    ask,
    closeAnswer,
    startOver,
    clearSelection,
    retake,
  };
}

export type VisualInterpreter = ReturnType<typeof useVisualInterpreter>;
