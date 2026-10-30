import { REQUEST_TIMEOUT_MS } from '@/config/env';

import { postJson } from './client';
import type { ApiResult } from './result';
import {
  IsolateResponseSchema,
  SegmentResponseSchema,
  type IsolateResponse,
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
    },
    IsolateResponseSchema,
    REQUEST_TIMEOUT_MS.analyze,
  );
}
