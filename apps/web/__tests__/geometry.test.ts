import {
  getMidPoint,
  getDistance,
  getRelativePointerCoordinates,
  isPointNearLine,
} from '../lib/canvas/geometry';
import { Point } from '@whiteboard/shared';

describe('Canvas Geometry Utilities', () => {
  describe('getMidPoint', () => {
    it('should calculate the exact midpoint between two points', () => {
      const p1: Point = { x: 0, y: 0 };
      const p2: Point = { x: 10, y: 20 };
      const mid = getMidPoint(p1, p2);
      expect(mid).toEqual({ x: 5, y: 10 });
    });
  });

  describe('getDistance', () => {
    it('should calculate Euclidean distance correctly', () => {
      const p1: Point = { x: 0, y: 0 };
      const p2: Point = { x: 3, y: 4 };
      expect(getDistance(p1, p2)).toBe(5);
    });
  });

  describe('getRelativePointerCoordinates', () => {
    it('should convert screen coordinates relative to element bounding rect', () => {
      const rect = {
        left: 100,
        top: 50,
        width: 800,
        height: 600,
        right: 900,
        bottom: 650,
        x: 100,
        y: 50,
        toJSON: () => {},
      };
      const point = getRelativePointerCoordinates(150, 120, rect);
      expect(point).toEqual({ x: 50, y: 70 });
    });
  });

  describe('isPointNearLine', () => {
    it('should return true when point is within threshold distance of a segment', () => {
      const p1: Point = { x: 0, y: 0 };
      const p2: Point = { x: 100, y: 0 };
      const pNear: Point = { x: 50, y: 2 };
      expect(isPointNearLine(pNear, p1, p2, 5)).toBe(true);
    });

    it('should return false when point is beyond threshold distance', () => {
      const p1: Point = { x: 0, y: 0 };
      const p2: Point = { x: 100, y: 0 };
      const pFar: Point = { x: 50, y: 20 };
      expect(isPointNearLine(pFar, p1, p2, 5)).toBe(false);
    });
  });
});
