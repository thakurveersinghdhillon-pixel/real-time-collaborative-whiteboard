import { Point } from '@whiteboard/shared';

/**
 * Calculates the midpoint between two points.
 * Used for smooth quadratic curve interpolation.
 */
export function getMidPoint(p1: Point, p2: Point): Point {
  return {
    x: p1.x + (p2.x - p1.x) / 2,
    y: p1.y + (p2.y - p1.y) / 2,
  };
}

/**
 * Calculates Euclidean distance between two points.
 */
export function getDistance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Converts screen/pointer event coordinates into exact relative canvas logical coordinates.
 */
export function getRelativePointerCoordinates(
  clientX: number,
  clientY: number,
  rect: DOMRectReadOnly | DOMRect
): Point {
  return {
    x: Math.round(clientX - rect.left),
    y: Math.round(clientY - rect.top),
  };
}

/**
 * Checks whether a given point is close to a line segment (used for precise erasing or selection in future).
 */
export function isPointNearLine(
  p: Point,
  p1: Point,
  p2: Point,
  threshold: number
): boolean {
  const lineDist = getDistance(p1, p2);
  if (lineDist === 0) return getDistance(p, p1) <= threshold;

  // Project point onto line segment
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) /
        (lineDist * lineDist)
    )
  );

  const projection: Point = {
    x: p1.x + t * (p2.x - p1.x),
    y: p1.y + t * (p2.y - p1.y),
  };

  return getDistance(p, projection) <= threshold;
}
