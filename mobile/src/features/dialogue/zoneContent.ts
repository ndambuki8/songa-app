import type { DialogueTurn, PendingTranscript, Speaker } from './hooks/useDialogueBridge';

export interface ZoneContent {
  caption: string;
  headline: string;
  detail: string | null;
}

/**
 * Decides what each half of the split screen shows for the latest turn: the listener sees the
 * refined translation in their own language, the speaker sees what Songa heard. While a turn is still
 * being translated, the speaker already sees the transcript and the listener sees a waiting marker.
 */
export function selectZoneContent(
  turn: DialogueTurn | null,
  zone: Speaker,
  pending: PendingTranscript | null = null,
): ZoneContent {
  const isTraveler = zone === 'traveler';

  if (pending) {
    if (pending.speaker === zone) {
      return {
        caption: isTraveler ? 'You said' : 'Heard',
        headline: pending.text,
        detail: isTraveler ? 'Translating…' : null,
      };
    }
    return { caption: isTraveler ? 'They mean' : 'Translation', headline: '…', detail: null };
  }

  if (!turn) {
    return {
      caption: isTraveler ? 'You' : 'Local resident',
      headline: isTraveler ? 'Tap the mic and say what you need.' : 'Tap the mic to reply.',
      detail: null,
    };
  }

  if (turn.speaker === zone) {
    return {
      caption: isTraveler ? 'You said' : 'Heard',
      headline: turn.transcriptText,
      detail: isTraveler ? `Intent: ${turn.extractedIntent}` : null,
    };
  }

  return {
    caption: isTraveler ? 'They mean' : 'Translation',
    headline: turn.processedIntentText,
    detail: isTraveler ? turn.politenessNotes : null,
  };
}
