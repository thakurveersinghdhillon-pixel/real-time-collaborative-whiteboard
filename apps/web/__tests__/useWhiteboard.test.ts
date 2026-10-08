import { renderHook, act } from '@testing-library/react';
import { useWhiteboard } from '../hooks/useWhiteboard';

describe('useWhiteboard Hook', () => {
  it('should initialize with default state', () => {
    const { result } = renderHook(() => useWhiteboard());

    expect(result.current.strokes).toEqual([]);
    expect(result.current.activeStroke).toBeNull();
    expect(result.current.tool).toBe('pen');
    expect(result.current.color).toBe('#0f172a');
    expect(result.current.strokeWidth).toBe(4);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('should handle tool, color, and width changes', () => {
    const { result } = renderHook(() => useWhiteboard());

    act(() => {
      result.current.setTool('eraser');
      result.current.setColor('#ef4444');
      result.current.setStrokeWidth(12);
    });

    expect(result.current.tool).toBe('eraser');
    expect(result.current.color).toBe('#ef4444');
    expect(result.current.strokeWidth).toBe(12);
  });

  it('should create and commit a stroke with point handling', () => {
    const { result } = renderHook(() => useWhiteboard());

    act(() => {
      result.current.startStroke({ x: 10, y: 20 });
    });

    expect(result.current.activeStroke).not.toBeNull();
    expect(result.current.activeStroke?.points).toEqual([{ x: 10, y: 20 }]);

    act(() => {
      result.current.addPointToStroke({ x: 15, y: 25 });
      // Duplicate point should be ignored
      result.current.addPointToStroke({ x: 15, y: 25 });
      result.current.addPointToStroke({ x: 20, y: 30 });
    });

    expect(result.current.activeStroke?.points).toHaveLength(3);

    act(() => {
      result.current.endStroke();
    });

    expect(result.current.activeStroke).toBeNull();
    expect(result.current.strokes).toHaveLength(1);
    expect(result.current.strokes[0].points).toHaveLength(3);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('should handle undo and redo operations correctly', () => {
    const { result } = renderHook(() => useWhiteboard());

    // Create stroke 1
    act(() => {
      result.current.startStroke({ x: 10, y: 10 });
      result.current.addPointToStroke({ x: 20, y: 20 });
      result.current.endStroke();
    });

    // Create stroke 2
    act(() => {
      result.current.startStroke({ x: 30, y: 30 });
      result.current.addPointToStroke({ x: 40, y: 40 });
      result.current.endStroke();
    });

    expect(result.current.strokes).toHaveLength(2);

    // Undo stroke 2
    act(() => {
      result.current.undo();
    });

    expect(result.current.strokes).toHaveLength(1);
    expect(result.current.canRedo).toBe(true);

    // Redo stroke 2
    act(() => {
      result.current.redo();
    });

    expect(result.current.strokes).toHaveLength(2);
    expect(result.current.canRedo).toBe(false);
  });

  it('should invalidate redo history when a new stroke is added after undo', () => {
    const { result } = renderHook(() => useWhiteboard());

    // Create stroke 1
    act(() => {
      result.current.startStroke({ x: 10, y: 10 });
      result.current.endStroke();
    });

    // Undo stroke 1
    act(() => {
      result.current.undo();
    });

    expect(result.current.canRedo).toBe(true);

    // Draw a new stroke
    act(() => {
      result.current.startStroke({ x: 50, y: 50 });
      result.current.endStroke();
    });

    // Redo stack should be cleared/invalidated
    expect(result.current.canRedo).toBe(false);
    expect(result.current.strokes).toHaveLength(1);
  });

  it('should clear the board and allow undoing the clear operation', () => {
    const { result } = renderHook(() => useWhiteboard());

    // Add 2 strokes
    act(() => {
      result.current.startStroke({ x: 10, y: 10 });
      result.current.endStroke();
      result.current.startStroke({ x: 20, y: 20 });
      result.current.endStroke();
    });

    expect(result.current.strokes).toHaveLength(2);

    // Clear board
    act(() => {
      result.current.clearStrokes();
    });

    expect(result.current.strokes).toHaveLength(0);
    expect(result.current.canUndo).toBe(true);

    // Undo clear operation
    act(() => {
      result.current.undo();
    });

    expect(result.current.strokes).toHaveLength(2);
  });
});
