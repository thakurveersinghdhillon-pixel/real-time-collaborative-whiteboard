import { useEffect, useRef, useState, useCallback } from 'react';
import { Stroke, CanvasDimensions, Point } from '@whiteboard/shared';
import { renderCanvas } from '../lib/canvas/renderer';
import { getRelativePointerCoordinates } from '../lib/canvas/geometry';

interface UseCanvasDrawingProps {
  strokes: Stroke[];
  activeStroke: Stroke | null;
  onPointerDown: (point: Point) => void;
  onPointerMove: (point: Point) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onCursorMove?: (point: Point) => void;
}

export function useCanvasDrawing({
  strokes,
  activeStroke,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onCursorMove,
}: UseCanvasDrawingProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [dimensions, setDimensions] = useState<CanvasDimensions>({
    width: 0,
    height: 0,
    dpr: 1,
  });

  const isPointerDownRef = useRef(false);
  const lastCursorMoveTimeRef = useRef<number>(0);

  const updateCanvasDimensions = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);

    if (width <= 0 || height <= 0) return;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    setDimensions({ width, height, dpr });
  }, []);

  useEffect(() => {
    updateCanvasDimensions();

    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasDimensions();
    });

    resizeObserver.observe(container);
    window.addEventListener('resize', updateCanvasDimensions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateCanvasDimensions);
    };
  }, [updateCanvasDimensions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height, dpr } = dimensions;
    if (width === 0 || height === 0) return;

    renderCanvas(ctx, strokes, width, height, dpr, activeStroke);
  }, [strokes, activeStroke, dimensions]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (e.button !== 0) return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Defensive fallback
    }

    isPointerDownRef.current = true;
    const rect = canvas.getBoundingClientRect();
    const point = getRelativePointerCoordinates(e.clientX, e.clientY, rect);
    onPointerDown(point);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const point = getRelativePointerCoordinates(e.clientX, e.clientY, rect);

    if (isPointerDownRef.current) {
      onPointerMove(point);
    }

    // Throttled cursor movement broadcast (~28 fps / max once per 35ms)
    if (onCursorMove) {
      const now = Date.now();
      if (now - lastCursorMoveTimeRef.current >= 35) {
        lastCursorMoveTimeRef.current = now;
        onCursorMove(point);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDownRef.current) return;
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // Defensive fallback
      }
    }

    isPointerDownRef.current = false;
    onPointerUp();
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDownRef.current) return;
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // Defensive fallback
      }
    }

    isPointerDownRef.current = false;
    onPointerCancel();
  };

  return {
    canvasRef,
    containerRef,
    dimensions,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}
