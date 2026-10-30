export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where an image rendered with `resizeMode="contain"` actually lands inside its container. */
export interface ContainFrame {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export function computeContainFrame(container: Size, image: Size): ContainFrame {
  if (container.width <= 0 || container.height <= 0 || image.width <= 0 || image.height <= 0) {
    return { scale: 0, offsetX: 0, offsetY: 0, width: 0, height: 0 };
  }
  const scale = Math.min(container.width / image.width, container.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    scale,
    offsetX: (container.width - width) / 2,
    offsetY: (container.height - height) / 2,
    width,
    height,
  };
}

export function imageRectToView(rect: Rect, frame: ContainFrame): Rect {
  return {
    x: frame.offsetX + rect.x * frame.scale,
    y: frame.offsetY + rect.y * frame.scale,
    width: rect.width * frame.scale,
    height: rect.height * frame.scale,
  };
}

/** Converts a touch in container coordinates to image pixels, or `null` if it hit the letterbox. */
export function viewPointToImage(point: Point, frame: ContainFrame, image: Size): Point | null {
  if (frame.scale === 0) return null;
  const x = (point.x - frame.offsetX) / frame.scale;
  const y = (point.y - frame.offsetY) / frame.scale;
  if (x < 0 || y < 0 || x > image.width || y > image.height) return null;
  return { x, y };
}

export function rectContains(rect: Rect, point: Point): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

/** Picks the tightest rectangle under the point so small items win over the boxes enclosing them. */
export function smallestContaining<T extends { bbox: Rect }>(items: readonly T[], point: Point): T | null {
  let best: T | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const item of items) {
    if (!rectContains(item.bbox, point)) continue;
    const area = item.bbox.width * item.bbox.height;
    if (area < bestArea) {
      best = item;
      bestArea = area;
    }
  }
  return best;
}
