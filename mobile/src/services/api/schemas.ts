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

/** Events from `POST /api/dialogue/intent-bridge/stream`, one JSON object per line. */
export const IntentBridgeStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('transcript'), text: z.string(), ...timed }),
  IntentBridgeResponseSchema.extend({ type: z.literal('result') }),
  z.object({
    type: z.literal('error'),
    status: z.number(),
    error: z.object({ code: z.string(), message: z.string() }),
    latency_ms: z.number(),
  }),
]);
export type IntentBridgeStreamEvent = z.infer<typeof IntentBridgeStreamEventSchema>;

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

/** Events from `POST /api/vision/ask`, one JSON object per line. */
export const AskStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('answer'),
    title: z.string(),
    answer: z.string(),
    find: z.array(z.string()),
    ...timed,
  }),
  z.object({ type: z.literal('highlights'), segments: z.array(SegmentSchema), ...timed }),
]);
export type AskStreamEvent = z.infer<typeof AskStreamEventSchema>;

export const ItineraryEventSchema = z.object({
  timestamp: z.string(),
  /** The time was inferred rather than read from the moments; shown as "~14:00". */
  time_is_estimate: z.boolean().default(false),
  activity: z.string(),
  location: z.string().default(''),
  notes: z.string().nullable().optional(),
  source_entry_ids: z.array(z.string()),
});
export type ItineraryEvent = z.infer<typeof ItineraryEventSchema>;

export const ItineraryResponseSchema = z.object({
  summary: z.string(),
  events: z.array(ItineraryEventSchema),
  /** Plans and reminders for later that came up during the day. */
  to_do: z.array(z.string()).default([]),
  ...timed,
});
export type ItineraryResponse = z.infer<typeof ItineraryResponseSchema>;

export const CardPhraseSchema = z.object({ local: z.string(), meaning: z.string() });
export type CardPhrase = z.infer<typeof CardPhraseSchema>;

/** `POST /api/cards/local`: a card the traveler shows to a local, in the local language. */
export const LocalCardResponseSchema = z.object({
  kind: z.enum(['home', 'needs']),
  target_locale: z.string(),
  title_local: z.string(),
  title_meaning: z.string(),
  body_local: z.string(),
  body_meaning: z.string(),
  phrases: z.array(CardPhraseSchema),
  ...timed,
});
export type LocalCardResponse = z.infer<typeof LocalCardResponseSchema>;

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
