import { z } from 'zod';

/** Runtime contracts mirroring `backend/songa/schemas.py`. */

const timed = {
  latency_ms: z.number(),
  timings: z.record(z.string(), z.number()).optional(),
};

export const IntentBridgeResponseSchema = z.object({
  raw_transcription: z.string(),
  detected_language: z.string().nullable(),
  extracted_intent: z.string(),
  culturally_refined_translation: z.string(),
  politeness_notes: z.string().nullable().optional(),
  target_locale: z.string(),
  ...timed,
});
export type IntentBridgeResponse = z.infer<typeof IntentBridgeResponseSchema>;

export const TranscribeResponseSchema = z.object({
  text: z.string(),
  detected_language: z.string().nullable(),
  ...timed,
});
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

export const SegmentSchema = z.object({
  id: z.string(),
  label: z.string(),
  score: z.number(),
  bbox: BoundingBoxSchema,
});
export type Segment = z.infer<typeof SegmentSchema>;

export const SegmentResponseSchema = z.object({
  image_id: z.string(),
  width: z.number(),
  height: z.number(),
  segments: z.array(SegmentSchema),
  ...timed,
});
export type SegmentResponse = z.infer<typeof SegmentResponseSchema>;

export const IsolateResponseSchema = z.object({
  detected_object: z.string(),
  contextual_description: z.string(),
  price_breakdown: z.string().nullable(),
  safety_precautions: z.array(z.string()),
  segment_bbox: BoundingBoxSchema,
  ...timed,
});
export type IsolateResponse = z.infer<typeof IsolateResponseSchema>;

export const ItineraryEventSchema = z.object({
  timestamp: z.string(),
  activity: z.string(),
  location: z.string(),
  notes: z.string().nullable().optional(),
  source_entry_ids: z.array(z.string()),
});
export type ItineraryEvent = z.infer<typeof ItineraryEventSchema>;

export const ItineraryResponseSchema = z.object({
  summary: z.string(),
  events: z.array(ItineraryEventSchema),
  ...timed,
});
export type ItineraryResponse = z.infer<typeof ItineraryResponseSchema>;

export const TripBriefingResponseSchema = z.object({
  destination: z.string(),
  destination_locale: z.string(),
  summary: z.string(),
  days: z.array(z.object({ date: z.string(), title: z.string(), suggestions: z.array(z.string()) })),
  phrases: z.array(z.object({ meaning: z.string(), phrase: z.string(), pronunciation: z.string().nullable().optional() })),
  etiquette: z.array(z.string()),
  safety: z.array(z.string()),
  money: z.array(z.string()),
  getting_around: z.array(z.string()),
  emergency_numbers: z.array(z.object({ label: z.string(), number: z.string() })),
  ...timed,
});
export type TripBriefing = z.infer<typeof TripBriefingResponseSchema>;

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
