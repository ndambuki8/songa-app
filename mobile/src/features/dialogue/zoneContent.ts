import type { DialogueTurn, Speaker } from './hooks/useDialogueBridge';

export interface ZoneContent {
  caption: string;
  headline: string;
  detail: string | null;
}

/**
 * Decides what each half of the split screen shows for the latest turn: the listener sees the
 * refined translation in their own language, the speaker sees what Songa heard.
 */
export function selectZoneContent(turn: DialogueTurn | null, zone: Speaker): ZoneContent {
  const isTraveler = zone === 'traveler';

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
