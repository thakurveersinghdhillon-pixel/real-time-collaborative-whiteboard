export type {
  Point,
  Stroke,
  ToolType,
  WhiteboardState,
  CanvasDimensions,
  HealthResponse,
} from '@whiteboard/shared';

export interface UseWhiteboardOptions {
  initialColor?: string;
  initialWidth?: number;
  initialTool?: 'pen' | 'eraser';
}
