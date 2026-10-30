import { describe, expect, it } from '@jest/globals';

import {
  cardinalDirection,
  formatDistance,
  haversineDistanceMeters,
  initialBearingDegrees,
  normalizeDegrees,
  relativeArrowAngle,
  shortestRotation,
} from '../geo';

const NAIROBI = { latitude: -1.286389, longitude: 36.817223 };
const MOMBASA = { latitude: -4.043477, longitude: 39.668206 };
const LONDON = { latitude: 51.5074, longitude: -0.1278 };
const PARIS = { latitude: 48.8566, longitude: 2.3522 };

describe('haversineDistanceMeters', () => {
  it('matches known city distances within 0.5%', () => {
    expect(haversineDistanceMeters(LONDON, PARIS)).toBeGreaterThan(342_000);
    expect(haversineDistanceMeters(LONDON, PARIS)).toBeLessThan(345_500);
    expect(haversineDistanceMeters(NAIROBI, MOMBASA)).toBeGreaterThan(438_000);
    expect(haversineDistanceMeters(NAIROBI, MOMBASA)).toBeLessThan(443_000);
  });

  it('is zero for identical points', () => {
    expect(haversineDistanceMeters(PARIS, PARIS)).toBe(0);
  });

  it('resolves short walking distances', () => {
    const block = { latitude: NAIROBI.latitude + 0.001, longitude: NAIROBI.longitude };
    expect(haversineDistanceMeters(NAIROBI, block)).toBeCloseTo(111.2, 0);
  });
});

describe('initialBearingDegrees', () => {
  it('points due north and due east on simple offsets', () => {
    expect(initialBearingDegrees({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(0, 5);
    expect(initialBearingDegrees({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(90, 5);
    expect(initialBearingDegrees({ latitude: 0, longitude: 0 }, { latitude: -1, longitude: 0 })).toBeCloseTo(180, 5);
  });

  it('matches the London to Paris bearing', () => {
    expect(initialBearingDegrees(LONDON, PARIS)).toBeCloseTo(148.1, 0);
  });
});

describe('relativeArrowAngle', () => {
  it('subtracts the device heading and wraps', () => {
    expect(relativeArrowAngle(90, 0)).toBe(90);
    expect(relativeArrowAngle(10, 350)).toBe(20);
    expect(relativeArrowAngle(350, 10)).toBe(340);
  });
});

describe('shortestRotation', () => {
  it('turns through the shorter arc across north', () => {
    expect(shortestRotation(350, 10)).toBe(370);
    expect(shortestRotation(10, 350)).toBe(-10);
    expect(shortestRotation(720, 90)).toBe(810);
  });
});

describe('formatting', () => {
  it('normalises negative degrees', () => {
    expect(normalizeDegrees(-90)).toBe(270);
  });

  it('names cardinal directions', () => {
    expect(cardinalDirection(0)).toBe('N');
    expect(cardinalDirection(44)).toBe('NE');
    expect(cardinalDirection(359)).toBe('N');
    expect(cardinalDirection(225)).toBe('SW');
  });

  it('switches to kilometres past 1000 m', () => {
    expect(formatDistance(842.4)).toEqual({ value: '842', unit: 'm' });
    expect(formatDistance(1530)).toEqual({ value: '1.53', unit: 'km' });
    expect(formatDistance(12_400)).toEqual({ value: '12.4', unit: 'km' });
  });
});
