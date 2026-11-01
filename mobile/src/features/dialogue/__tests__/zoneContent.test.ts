import { describe, expect, it } from '@jest/globals';

import type { DialogueTurn } from '../hooks/useDialogueBridge';
import { selectZoneContent } from '../zoneContent';

const travelerTurn: DialogueTurn = {
  speaker: 'traveler',
  transcriptText: 'Does this have peanuts?',
  processedIntentText: 'この料理にピーナッツは入っていますか？',
  extractedIntent: 'Asking whether the dish contains peanuts.',
  politenessNotes: 'Used polite desu/masu form.',
  spokenLocale: 'ja-JP',
  latencyMs: 1200,
  confirmed: false,
};

describe('selectZoneContent', () => {
  it('shows prompts before any turn', () => {
    expect(selectZoneContent(null, 'traveler').headline).toBe('Tap the mic and say what you need.');
    expect(selectZoneContent(null, 'resident').headline).toBe('Tap the mic to reply.');
  });

  it('shows an unconfirmed traveler turn only to the traveler', () => {
    const traveler = selectZoneContent(travelerTurn, 'traveler');
    expect(traveler.caption).toBe('Songa understood');
    expect(traveler.headline).toBe(travelerTurn.extractedIntent);
    expect(traveler.detail).toContain(travelerTurn.transcriptText);
    expect(selectZoneContent(travelerTurn, 'resident').headline).toBe('Tap the mic to reply.');
  });

  it('shows the translation to the resident once confirmed', () => {
    const confirmed = { ...travelerTurn, confirmed: true };
    expect(selectZoneContent(confirmed, 'resident').headline).toBe(confirmed.processedIntentText);
    expect(selectZoneContent(confirmed, 'resident').note).toBeNull();
    expect(selectZoneContent(confirmed, 'traveler').headline).toBe(confirmed.transcriptText);
    expect(selectZoneContent(confirmed, 'traveler').note).toBe(confirmed.politenessNotes);
  });

  it('shows a resident reply translated on the traveler half', () => {
    const reply: DialogueTurn = { ...travelerTurn, speaker: 'resident', confirmed: true, processedIntentText: 'No peanuts.' };
    expect(selectZoneContent(reply, 'traveler').caption).toBe('They mean');
    expect(selectZoneContent(reply, 'traveler').headline).toBe('No peanuts.');
    expect(selectZoneContent(reply, 'resident').headline).toBe(reply.transcriptText);
  });
});
