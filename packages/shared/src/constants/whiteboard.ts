import { ToolType } from '../types/whiteboard';

export const DEFAULT_COLOR = '#0f172a'; // slate-900
export const DEFAULT_STROKE_WIDTH = 4;
export const MIN_STROKE_WIDTH = 1;
export const MAX_STROKE_WIDTH = 50;
export const DEFAULT_TOOL: ToolType = 'pen';

export const PALETTE_COLORS = [
  { name: 'Slate', value: '#0f172a' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Green', value: '#10b981' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
] as const;

export const STROKE_WIDTH_PRESETS = [2, 4, 8, 14, 24, 36] as const;
