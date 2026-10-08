'use client';

import React, { useEffect } from 'react';
import {
  Pencil,
  Eraser,
  RotateCcw,
  RotateCw,
  Trash2,
  Sliders,
  Eye,
  Lock,
} from 'lucide-react';
import { ToolType, BoardRole } from '@whiteboard/shared';
import {
  PALETTE_COLORS,
  STROKE_WIDTH_PRESETS,
  MIN_STROKE_WIDTH,
  MAX_STROKE_WIDTH,
} from '@whiteboard/shared';

interface WhiteboardToolbarProps {
  tool: ToolType;
  color: string;
  strokeWidth: number;
  canUndo: boolean;
  canRedo: boolean;
  userRole?: BoardRole;
  onSelectTool: (tool: ToolType) => void;
  onSelectColor: (color: string) => void;
  onSelectWidth: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearClick: () => void;
}

export const WhiteboardToolbar: React.FC<WhiteboardToolbarProps> = ({
  tool,
  color,
  strokeWidth,
  canUndo,
  canRedo,
  userRole = 'EDITOR',
  onSelectTool,
  onSelectColor,
  onSelectWidth,
  onUndo,
  onRedo,
  onClearClick,
}) => {
  const isViewer = userRole === 'VIEWER';
  const isOwner = userRole === 'OWNER';

  // Listen for global keyboard shortcuts
  useEffect(() => {
    if (isViewer) return; // Disable keyboard shortcuts for viewers

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing inside input elements
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) onRedo();
        } else {
          if (canUndo) onUndo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (canRedo) onRedo();
      } else if (e.key.toLowerCase() === 'p') {
        onSelectTool('pen');
      } else if (e.key.toLowerCase() === 'e') {
        onSelectTool('eraser');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, onUndo, onRedo, onSelectTool, isViewer]);

  if (isViewer) {
    return (
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-xl border border-slate-700 text-slate-300 text-xs font-semibold">
        <Eye className="w-4 h-4 text-slate-400" />
        <span>Read-Only Viewer Mode (Drawing disabled)</span>
      </div>
    );
  }

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-wrap items-center gap-2 p-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 transition-all max-w-[95vw] sm:max-w-none">
      {/* Tool Selection Group */}
      <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
        <button
          onClick={() => onSelectTool('pen')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            tool === 'pen'
              ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
          title="Pen Tool (P)"
          aria-label="Pen Tool"
        >
          <Pencil className="w-4 h-4" />
          <span className="hidden sm:inline">Pen</span>
        </button>

        <button
          onClick={() => onSelectTool('eraser')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            tool === 'eraser'
              ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
          title="Eraser Tool (E)"
          aria-label="Eraser Tool"
        >
          <Eraser className="w-4 h-4" />
          <span className="hidden sm:inline">Eraser</span>
        </button>
      </div>

      <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

      {/* Color Palette Selection */}
      <div className="flex items-center space-x-1.5">
        <div className="flex items-center space-x-1">
          {PALETTE_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => {
                onSelectColor(c.value);
                if (tool === 'eraser') onSelectTool('pen');
              }}
              style={{ backgroundColor: c.value }}
              className={`w-6 h-6 rounded-full transition transform hover:scale-110 focus:outline-none ${
                color === c.value && tool === 'pen'
                  ? 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900 scale-110'
                  : 'opacity-85 hover:opacity-100'
              }`}
              title={`${c.name} color`}
              aria-label={`${c.name} color swatch`}
            />
          ))}
        </div>

        {/* Custom Color Input */}
        <label
          className="relative cursor-pointer w-6 h-6 rounded-full overflow-hidden border border-slate-300 dark:border-slate-700 shadow-inner flex items-center justify-center hover:scale-105 transition"
          title="Custom Color"
        >
          <input
            type="color"
            value={color}
            onChange={(e) => {
              onSelectColor(e.target.value);
              if (tool === 'eraser') onSelectTool('pen');
            }}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            aria-label="Custom color picker"
          />
          <div
            className="w-full h-full rounded-full"
            style={{ backgroundColor: color }}
          />
        </label>
      </div>

      <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

      {/* Stroke Width Slider & Presets */}
      <div className="flex items-center space-x-2">
        <div className="flex items-center space-x-1 text-slate-500 text-xs font-mono">
          <Sliders className="w-3.5 h-3.5" />
          <span className="w-6 text-center">{strokeWidth}px</span>
        </div>

        <input
          type="range"
          min={MIN_STROKE_WIDTH}
          max={MAX_STROKE_WIDTH}
          value={strokeWidth}
          onChange={(e) => onSelectWidth(Number(e.target.value))}
          className="w-20 accent-indigo-600 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
          title={`Stroke Width: ${strokeWidth}px`}
          aria-label="Stroke width slider"
        />

        <div className="hidden lg:flex items-center space-x-1">
          {STROKE_WIDTH_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => onSelectWidth(preset)}
              className={`w-6 h-6 rounded-md text-[10px] font-mono transition ${
                strokeWidth === preset
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title={`Preset ${preset}px`}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-0.5" />

      {/* History Controls (Undo / Redo / Clear) */}
      <div className="flex items-center space-x-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`p-2 rounded-xl transition ${
            canUndo
              ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200'
              : 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
          }`}
          title="Undo (Ctrl+Z / Cmd+Z)"
          aria-label="Undo action"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`p-2 rounded-xl transition ${
            canRedo
              ? 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200'
              : 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
          }`}
          title="Redo (Ctrl+Y / Cmd+Shift+Z)"
          aria-label="Redo action"
        >
          <RotateCw className="w-4 h-4" />
        </button>

        <button
          onClick={onClearClick}
          disabled={!isOwner}
          className={`p-2 rounded-xl transition ml-1 ${
            isOwner
              ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 active:bg-red-100'
              : 'text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-50'
          }`}
          title={isOwner ? 'Clear Canvas' : 'Only board owner can clear'}
          aria-label="Clear Canvas"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
