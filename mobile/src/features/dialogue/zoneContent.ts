import type { DialogueTurn, Speaker } from './hooks/useDialogueBridge';

export interface ZoneContent {
  caption: string;
  headline: string;
  detail: string | null;
  /** Cultural adaptation notes, shown behind a disclosure on the traveler half. */
  note: string | null;
}

function idleContent(zone: Speaker): ZoneContent {
  return zone === 'traveler'
    ? { caption: 'You', headline: 'Tap the mic and say what you need.', detail: null, note: null }
    : { caption: 'Local resident', headline: 'Tap the mic to reply.', detail: null, note: null };
}

/**
 * Decides what each half of the split screen shows for the latest turn: the listener sees the
 * refined translation in their own language, the speaker sees what Songa heard. A traveler turn
 * awaiting review is only shown to the traveler.
 */
export function selectZoneContent(turn: DialogueTurn | null, zone: Speaker): ZoneContent {
  if (!turn) return idleContent(zone);
  const isTraveler = zone === 'traveler';

  if (!turn.confirmed) {
    if (!isTraveler) return idleContent(zone);
    return {
      caption: 'Songa understood',
      headline: turn.extractedIntent,
      detail: `You said: “${turn.transcriptText}”`,
      note: turn.politenessNotes,
    };
  }

  if (turn.speaker === zone) {
    return {
      caption: isTraveler ? 'You said' : 'Heard',
      headline: turn.transcriptText,
      detail: null,
      note: isTraveler ? turn.politenessNotes : null,
    };
  }

  return {
    caption: isTraveler ? 'They mean' : 'Translation',
    headline: turn.processedIntentText,
    detail: null,
    note: isTraveler ? turn.politenessNotes : null,
  };
}
