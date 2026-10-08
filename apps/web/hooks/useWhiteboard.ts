import { useState, useCallback } from 'react';
import { Stroke, Point, ToolType } from '@whiteboard/shared';
import {
  DEFAULT_COLOR,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_TOOL,
} from '@whiteboard/shared';

export interface UseWhiteboardReturn {
  strokes: Stroke[];
  activeStroke: Stroke | null;
  tool: ToolType;
  color: string;
  strokeWidth: number;
  canUndo: boolean;
  canRedo: boolean;
  setTool: (tool: ToolType) => void;
  setColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  startStroke: (point: Point) => void;
  addPointToStroke: (point: Point) => void;
  endStroke: () => Stroke | null;
  cancelStroke: () => void;
  undo: () => Stroke | null;
  redo: () => Stroke | null;
  clearStrokes: () => boolean;
  // Remote Synchronization Handlers
  addRemoteStroke: (stroke: Stroke) => void;
  removeRemoteStroke: (strokeId: string) => void;
  clearRemoteStrokes: () => void;
  setInitialBoardState: (strokes: Stroke[]) => void;
}

export function useWhiteboard(options?: {
  initialColor?: string;
  initialWidth?: number;
  initialTool?: ToolType;
}): UseWhiteboardReturn {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [undoStack, setUndoStack] = useState<Stroke[][]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[][]>([]);

  const [tool, setTool] = useState<ToolType>(options?.initialTool ?? DEFAULT_TOOL);
  const [color, setColor] = useState<string>(options?.initialColor ?? DEFAULT_COLOR);
  const [strokeWidth, setStrokeWidth] = useState<number>(
    options?.initialWidth ?? DEFAULT_STROKE_WIDTH
  );
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null);

  const startStroke = useCallback(
    (point: Point) => {
      const newStroke: Stroke = {
        id: `stroke-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        points: [point],
        color,
        width: strokeWidth,
        tool,
        createdAt: Date.now(),
      };
      setActiveStroke(newStroke);
    },
    [color, strokeWidth, tool]
  );

  const addPointToStroke = useCallback((point: Point) => {
    setActiveStroke((prev) => {
      if (!prev) return null;
      const lastPoint = prev.points[prev.points.length - 1];
      if (lastPoint && lastPoint.x === point.x && lastPoint.y === point.y) {
        return prev;
      }
      return {
        ...prev,
        points: [...prev.points, point],
      };
    });
  }, []);

  const endStroke = useCallback((): Stroke | null => {
    let committedStroke: Stroke | null = null;
    setActiveStroke((prevActive) => {
      if (prevActive && prevActive.points.length > 0) {
        committedStroke = prevActive;
        setStrokes((prevStrokes) => {
          setUndoStack((prevUndo) => [...prevUndo, prevStrokes]);
          setRedoStack([]); // Invalidate redo stack on new local action
          return [...prevStrokes, prevActive];
        });
      }
      return null;
    });
    return committedStroke;
  }, []);

  const cancelStroke = useCallback(() => {
    setActiveStroke(null);
  }, []);

  const undo = useCallback((): Stroke | null => {
    let removedStroke: Stroke | null = null;
    setUndoStack((prevUndo) => {
      if (prevUndo.length === 0) return prevUndo;
      const previousState = prevUndo[prevUndo.length - 1];
      const newUndo = prevUndo.slice(0, prevUndo.length - 1);

      setStrokes((currentStrokes) => {
        // Find which stroke was removed in this undo step
        if (currentStrokes.length > previousState.length) {
          removedStroke = currentStrokes[currentStrokes.length - 1];
        }
        setRedoStack((prevRedo) => [...prevRedo, currentStrokes]);
        return previousState;
      });

      return newUndo;
    });
    return removedStroke;
  }, []);

  const redo = useCallback((): Stroke | null => {
    let restoredStroke: Stroke | null = null;
    setRedoStack((prevRedo) => {
      if (prevRedo.length === 0) return prevRedo;
      const nextState = prevRedo[prevRedo.length - 1];
      const newRedo = prevRedo.slice(0, prevRedo.length - 1);

      setStrokes((currentStrokes) => {
        if (nextState.length > currentStrokes.length) {
          restoredStroke = nextState[nextState.length - 1];
        }
        setUndoStack((prevUndo) => [...prevUndo, currentStrokes]);
        return nextState;
      });

      return newRedo;
    });
    return restoredStroke;
  }, []);

  const clearStrokes = useCallback((): boolean => {
    let wasCleared = false;
    setStrokes((currentStrokes) => {
      if (currentStrokes.length === 0) return currentStrokes;
      wasCleared = true;
      setUndoStack((prevUndo) => [...prevUndo, currentStrokes]);
      setRedoStack([]);
      return [];
    });
    return wasCleared;
  }, []);

  // Remote Event Synchronization Handlers
  const addRemoteStroke = useCallback((stroke: Stroke) => {
    setStrokes((prev) => {
      if (prev.some((s) => s.id === stroke.id)) return prev;
      return [...prev, stroke];
    });
  }, []);

  const removeRemoteStroke = useCallback((strokeId: string) => {
    setStrokes((prev) => prev.filter((s) => s.id !== strokeId));
  }, []);

  const clearRemoteStrokes = useCallback(() => {
    setStrokes([]);
  }, []);

  const setInitialBoardState = useCallback((remoteStrokes: Stroke[]) => {
    setStrokes(remoteStrokes);
  }, []);

  return {
    strokes,
    activeStroke,
    tool,
    color,
    strokeWidth,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    setTool,
    setColor,
    setStrokeWidth,
    startStroke,
    addPointToStroke,
    endStroke,
    cancelStroke,
    undo,
    redo,
    clearStrokes,
    addRemoteStroke,
    removeRemoteStroke,
    clearRemoteStrokes,
    setInitialBoardState,
  };
}
