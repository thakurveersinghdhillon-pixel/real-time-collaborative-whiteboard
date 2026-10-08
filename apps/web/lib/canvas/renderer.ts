import { Stroke } from '@whiteboard/shared';
import { getMidPoint } from './geometry';

/**
 * Draws a single stroke on the canvas 2D rendering context.
 */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const { points, color, width, tool } = stroke;
  if (!points || points.length === 0) return;

  ctx.save();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;

  if (tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.fillStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
  }

  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
  } else {
    for (let i = 1; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const mid = getMidPoint(current, next);
      ctx.quadraticCurveTo(current.x, current.y, mid.x, mid.y);
    }
    // Connect to the final point
    const lastPoint = points[points.length - 1];
    ctx.lineTo(lastPoint.x, lastPoint.y);
  }

  ctx.stroke();
  ctx.restore();
}

/**
 * Renders a subtle background dot grid.
 */

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  gridSize = 24
): void {
  ctx.save();
  ctx.fillStyle = '#cbd5e1'; // slate-300
  for (let x = gridSize; x < width; x += gridSize) {
    for (let y = gridSize; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Clears canvas and renders all finished strokes plus any active stroke.
 */
export function renderCanvas(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number,
  dpr: number,
  activeStroke: Stroke | null = null,
  showGrid = true
): void {
  // Clear full physical canvas area
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width * dpr, height * dpr);
  ctx.restore();

  // Apply device pixel ratio scaling for high-DPI rendering
  ctx.save();
  ctx.scale(dpr, dpr);

  if (showGrid) {
    drawGrid(ctx, width, height);
  }

  // Render committed strokes
  for (const stroke of strokes) {
    drawStroke(ctx, stroke);
  }

  // Render stroke currently in progress
  if (activeStroke) {
    drawStroke(ctx, activeStroke);
  }

  ctx.restore();
}
