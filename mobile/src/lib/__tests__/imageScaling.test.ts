import { describe, expect, it } from '@jest/globals';

import {
  computeContainFrame,
  imageRectToView,
  smallestContaining,
  viewPointToImage,
} from '../imageScaling';

describe('computeContainFrame', () => {
  it('letterboxes a landscape image inside a portrait container', () => {
    const frame = computeContainFrame({ width: 400, height: 800 }, { width: 1600, height: 1200 });
    expect(frame.scale).toBeCloseTo(0.25);
    expect(frame.width).toBeCloseTo(400);
    expect(frame.height).toBeCloseTo(300);
    expect(frame.offsetX).toBeCloseTo(0);
    expect(frame.offsetY).toBeCloseTo(250);
  });

  it('returns an empty frame for unmeasured layouts', () => {
    expect(computeContainFrame({ width: 0, height: 0 }, { width: 10, height: 10 }).scale).toBe(0);
  });
});

describe('coordinate mapping', () => {
  const image = { width: 1600, height: 1200 };
  const frame = computeContainFrame({ width: 400, height: 800 }, image);

  it('round-trips a point between view and image space', () => {
    const point = viewPointToImage({ x: 200, y: 400 }, frame, image);
    expect(point).not.toBeNull();
    expect(point!.x).toBeCloseTo(800);
    expect(point!.y).toBeCloseTo(600);
  });

  it('ignores taps in the letterbox', () => {
    expect(viewPointToImage({ x: 200, y: 100 }, frame, image)).toBeNull();
  });

  it('projects image rectangles into the view', () => {
    const rect = imageRectToView({ x: 400, y: 400, width: 800, height: 400 }, frame);
    expect(rect).toEqual({ x: 100, y: 350, width: 200, height: 100 });
  });
});

describe('smallestContaining', () => {
  it('prefers the tightest box under the point', () => {
    const items = [
      { id: 'board', bbox: { x: 0, y: 0, width: 100, height: 100 } },
      { id: 'price', bbox: { x: 40, y: 40, width: 10, height: 10 } },
    ];
    expect(smallestContaining(items, { x: 45, y: 45 })?.id).toBe('price');
    expect(smallestContaining(items, { x: 5, y: 5 })?.id).toBe('board');
    expect(smallestContaining(items, { x: 500, y: 5 })).toBeNull();
  });
});
