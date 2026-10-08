export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export type ToolType = 'pen' | 'eraser';

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
  tool: ToolType;
  createdAt?: number;
}

export interface WhiteboardState {
  strokes: Stroke[];
  undoStack: Stroke[][];
  redoStack: Stroke[][];
}

export interface CanvasDimensions {
  width: number;
  height: number;
  dpr: number;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
}
