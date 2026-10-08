'use client';

import React from 'react';
import { Stroke, Point, PresenceUser } from '@whiteboard/shared';
import { useCanvasDrawing } from '../hooks/useCanvasDrawing';
import { RemoteCursors } from './RemoteCursors';

interface WhiteboardCanvasProps {
  strokes: Stroke[];
  activeStroke: Stroke | null;
  tool: 'pen' | 'eraser';
  presenceUsers: PresenceUser[];
  localClientId: string;
  isViewer?: boolean;
  onStartStroke: (point: Point) => void;
  onAddPoint: (point: Point) => void;
  onEndStroke: () => void;
  onCancelStroke: () => void;
  onCursorMove: (point: Point) => void;
}

export const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({
  strokes,
  activeStroke,
  tool,
  presenceUsers,
  localClientId,
  isViewer = false,
  onStartStroke,
  onAddPoint,
  onEndStroke,
  onCancelStroke,
  onCursorMove,
}) => {
  const {
    canvasRef,
    containerRef,
    dimensions,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = useCanvasDrawing({
    strokes,
    activeStroke,
    onPointerDown: (pt) => {
      if (!isViewer) onStartStroke(pt);
    },
    onPointerMove: (pt) => {
      if (!isViewer) onAddPoint(pt);
    },
    onPointerUp: () => {
      if (!isViewer) onEndStroke();
    },
    onPointerCancel: () => {
      if (!isViewer) onCancelStroke();
    },
    onCursorMove,
  });

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-slate-50 dark:bg-slate-950 overflow-hidden select-none touch-none"
    >
      {/* Remote User Cursors Overlay */}
      <RemoteCursors users={presenceUsers} localClientId={localClientId} />

      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className={`w-full h-full block ${isViewer ? 'cursor-default' : 'cursor-crosshair'}`}
        style={{ touchAction: 'none' }}
      />

      {/* Dynamic Status / Canvas Specs Overlay */}
      <div className="absolute bottom-3 right-4 z-10 flex items-center space-x-3 text-[11px] font-mono text-slate-400 dark:text-slate-500 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm px-2.5 py-1 rounded-md border border-slate-200/60 dark:border-slate-800/60 pointer-events-none">
        <span>
          {dimensions.width}×{dimensions.height}px
        </span>
        <span>•</span>
        <span>DPR {dimensions.dpr}x</span>
        <span>•</span>
        <span>{strokes.length} strokes</span>
      </div>
    </div>
  );
};
