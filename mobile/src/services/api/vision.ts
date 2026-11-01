import { REQUEST_TIMEOUT_MS } from '@/config/env';
import type { CurrentPlace } from '@/lib/location';

import { FALLBACK_MESSAGES, postJson, postNdjson } from './client';
import { fail, ok, type ApiResult } from './result';
import {
  AskStreamEventSchema,
  IsolateResponseSchema,
  SegmentResponseSchema,
  type BoundingBox,
  type IsolateResponse,
  type Segment,
  type SegmentResponse,
} from './schemas';

export type SceneMode = 'menu' | 'signage' | 'market' | 'general';

export function requestSegmentation(imageBase64: string, scene: SceneMode): Promise<ApiResult<SegmentResponse>> {
  return postJson(
    '/api/vision/segment',
    { image_b64: imageBase64, scene },
    SegmentResponseSchema,
    REQUEST_TIMEOUT_MS.segment,
  );
}

export interface IsolateRequest {
  imageId: string;
  /** Sent only when the server-side image cache has expired. */
  imageBase64?: string;
  clickX: number;
  clickY: number;
  travelerLocale: string;
  homeCurrency: string;
  scene: SceneMode;
  /** The traveler's allergies and diet, so alerts are personal. */
  needs: string | null;
  /** Where the photo was taken, so local dishes, prices and signs are read correctly. */
  place: CurrentPlace | null;
}

function placeFields(place: CurrentPlace | null) {
  return {
    latitude: place?.coordinates.latitude ?? null,
    longitude: place?.coordinates.longitude ?? null,
    place_label: place?.label ?? null,
  };
}

export function requestSegmentAnalysis(request: IsolateRequest): Promise<ApiResult<IsolateResponse>> {
  return postJson(
    '/api/vision/sam-isolate',
    {
      image_id: request.imageBase64 ? null : request.imageId,
      image_b64: request.imageBase64 ?? null,
      click_x: Math.round(request.clickX),
      click_y: Math.round(request.clickY),
      traveler_locale: request.travelerLocale,
      home_currency: request.homeCurrency,
      scene: request.scene,
      traveler_needs: request.needs,
      ...placeFields(request.place),
    },
    IsolateResponseSchema,
    REQUEST_TIMEOUT_MS.analyze,
  );
}

export interface AskRequest {
  /** Server-side cached photo; pass `imageBase64` instead when there is none or it expired. */
  imageId: string | null;
  imageBase64?: string;
  question: string;
  /** The tapped item the question is about, in image pixels. Null asks about the whole photo. */
  focus: BoundingBox | null;
  travelerLocale: string;
  homeCurrency: string;
  scene: SceneMode;
  place: CurrentPlace | null;
  needs: string | null;
  /** Earlier exchanges about this photo, oldest first, so the question is answered as a follow-up. */
  history: { question: string; answer: string }[];
}

export interface AskAnswer {
  title: string;
  answer: string;
  /** Things the model said are visible and worth highlighting; highlights follow when non-empty. */
  find: string[];
  latencyMs: number;
}

export interface AskHandlers {
  onAnswer: (answer: AskAnswer) => void;
  onHighlights: (segments: Segment[]) => void;
}

/**
 * Asks a free-form question about the photo. The answer arrives first; boxes for the things it mentions arrive
 * in a second event once SAM 3.1 has found them.
 */
export async function askAboutPhoto(request: AskRequest, handlers: AskHandlers): Promise<ApiResult<null>> {
  const round = (value: number) => Math.round(value);
  const received: { malformed: boolean; answered: boolean } = { malformed: false, answered: false };

  const result = await postNdjson(
    '/api/vision/ask',
    {
      image_id: request.imageBase64 ? null : request.imageId,
      image_b64: request.imageBase64 ?? null,
      question: request.question,
      focus_bbox: request.focus
        ? { x: round(request.focus.x), y: round(request.focus.y), width: round(request.focus.width), height: round(request.focus.height) }
        : null,
      traveler_locale: request.travelerLocale,
      home_currency: request.homeCurrency,
      scene: request.scene,
      ...placeFields(request.place),
      traveler_needs: request.needs,
      history: request.history.slice(-6).map((turn) => ({
        question: turn.question.slice(0, 300),
        answer: turn.answer.slice(0, 1500),
      })),
    },
    (raw) => {
      const event = AskStreamEventSchema.safeParse(raw);
      if (!event.success) {
        received.malformed = true;
        return;
      }
      if (event.data.type === 'answer') {
        received.answered = true;
        handlers.onAnswer({
          title: event.data.title,
          answer: event.data.answer,
          find: event.data.find,
          latencyMs: event.data.latency_ms,
        });
      } else {
        handlers.onHighlights(event.data.segments);
      }
    },
    REQUEST_TIMEOUT_MS.ask,
  );

  if (!result.ok && result.error.status === 404) {
    return fail({ ...result.error, message: 'This Songa server does not support questions yet. Redeploy the backend.' });
  }
  if (!result.ok) return result;
  if (received.malformed || !received.answered) return fail({ kind: 'invalid_response', message: FALLBACK_MESSAGES.invalid_response });
  return ok(null);
}
