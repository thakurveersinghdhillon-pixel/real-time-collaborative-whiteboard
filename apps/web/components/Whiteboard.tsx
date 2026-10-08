'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useWhiteboard } from '../hooks/useWhiteboard';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAuth } from '../lib/auth/AuthContext';
import { Header } from './Header';
import { WhiteboardToolbar } from './WhiteboardToolbar';
import { WhiteboardCanvas } from './WhiteboardCanvas';
import { ClearConfirmModal } from './ClearConfirmModal';
import { HistoryModal } from './HistoryModal';
import { WsMessage, PresenceUser, Point, BoardRole } from '@whiteboard/shared';

interface WhiteboardProps {
  roomId: string;
}

export const Whiteboard: React.FC<WhiteboardProps> = ({ roomId }) => {
  const { user, token } = useAuth();

  const {
    strokes,
    activeStroke,
    tool,
    color,
    strokeWidth,
    canUndo,
    canRedo,
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
  } = useWhiteboard();

  const {
    status: wsStatus,
    clientId,
    displayName,
    setDisplayName,
    setAuthToken,
    joinRoom,
    leaveRoom,
    sendCursorMove,
    sendStrokeAdd,
    sendStrokeRemove,
    sendBoardClear,
    subscribe,
  } = useWebSocket();

  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [userRole, setUserRole] = useState<BoardRole>('EDITOR');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  // Sync token to WebSocket client
  useEffect(() => {
    setAuthToken(token);
  }, [token, setAuthToken]);

  // Sync logged in user's display name if available
  useEffect(() => {
    if (user?.displayName && displayName !== user.displayName) {
      setDisplayName(user.displayName);
    }
  }, [user, displayName, setDisplayName]);

  // Join room when authenticated
  useEffect(() => {
    if (wsStatus === 'authenticated') {
      const activeName = user?.displayName || displayName;
      joinRoom(roomId, activeName);
    }
    return () => {
      if (wsStatus === 'authenticated') {
        leaveRoom(roomId);
      }
    };
  }, [wsStatus, roomId, joinRoom, leaveRoom, displayName, user]);

  // Subscribe to room WebSocket events
  useEffect(() => {
    const unsubscribe = subscribe((message: WsMessage) => {
      switch (message.event) {
        case 'room:joined': {
          if (message.data.roomId === roomId) {
            setInitialBoardState(message.data.strokes);
            setPresenceUsers(message.data.presence);
            if (message.data.userRole) {
              setUserRole(message.data.userRole);
            }
          }
          break;
        }
        case 'room:error': {
          setErrorMessage(message.data.message);
          setTimeout(() => setErrorMessage(null), 4000);
          break;
        }
        case 'presence:state': {
          if (message.data.roomId === roomId) {
            setPresenceUsers(message.data.users);
          }
          break;
        }
        case 'cursor:move': {
          if (message.data.roomId === roomId && message.data.clientId !== clientId) {
            setPresenceUsers((prev) =>
              prev.map((u) =>
                u.clientId === message.data.clientId
                  ? { ...u, cursor: { x: message.data.x, y: message.data.y } }
                  : u
              )
            );
          }
          break;
        }
        case 'stroke:add': {
          if (message.data.roomId === roomId && message.data.clientId !== clientId) {
            addRemoteStroke(message.data.stroke);
          }
          break;
        }
        case 'stroke:remove': {
          if (message.data.roomId === roomId && message.data.clientId !== clientId) {
            removeRemoteStroke(message.data.strokeId);
          }
          break;
        }
        case 'board:clear': {
          if (message.data.roomId === roomId && message.data.clientId !== clientId) {
            clearRemoteStrokes();
          }
          break;
        }
        case 'board:state': {
          if (message.data.roomId === roomId) {
            setInitialBoardState(message.data.strokes);
          }
          break;
        }
      }
    });

    return () => unsubscribe();
  }, [
    subscribe,
    roomId,
    clientId,
    addRemoteStroke,
    removeRemoteStroke,
    clearRemoteStrokes,
    setInitialBoardState,
  ]);

  const handleCursorMove = useCallback(
    (point: Point) => {
      if (wsStatus === 'authenticated') {
        sendCursorMove(roomId, point.x, point.y);
      }
    },
    [wsStatus, roomId, sendCursorMove]
  );

  const handleEndStroke = () => {
    if (userRole === 'VIEWER') return;
    const stroke = endStroke();
    if (stroke) {
      sendStrokeAdd(roomId, stroke);
    }
  };

  const handleUndo = () => {
    if (userRole === 'VIEWER') return;
    const removedStroke = undo();
    if (removedStroke) {
      sendStrokeRemove(roomId, removedStroke.id);
    }
  };

  const handleRedo = () => {
    if (userRole === 'VIEWER') return;
    const restoredStroke = redo();
    if (restoredStroke) {
      sendStrokeAdd(roomId, restoredStroke);
    }
  };

  const handleClearConfirm = () => {
    if (userRole !== 'OWNER') return;
    const cleared = clearStrokes();
    if (cleared) {
      sendBoardClear(roomId);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100 dark:bg-slate-900 font-sans">
      <Header
        roomId={roomId}
        wsStatus={wsStatus}
        clientId={clientId}
        displayName={user?.displayName || displayName}
        presenceUsers={presenceUsers}
        userRole={userRole}
        onUpdateDisplayName={setDisplayName}
        onOpenHistory={() => setIsHistoryModalOpen(true)}
      />

      {errorMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-4 py-2 rounded-xl shadow-xl text-xs font-semibold animate-bounce">
          {errorMessage}
        </div>
      )}

      <main className="relative flex-1 w-full h-full overflow-hidden">
        <WhiteboardToolbar
          tool={tool}
          color={color}
          strokeWidth={strokeWidth}
          canUndo={canUndo}
          canRedo={canRedo}
          userRole={userRole}
          onSelectTool={setTool}
          onSelectColor={setColor}
          onSelectWidth={setStrokeWidth}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClearClick={() => setIsClearModalOpen(true)}
        />

        <WhiteboardCanvas
          strokes={strokes}
          activeStroke={activeStroke}
          tool={tool}
          presenceUsers={presenceUsers}
          localClientId={clientId}
          isViewer={userRole === 'VIEWER'}
          onStartStroke={startStroke}
          onAddPoint={addPointToStroke}
          onEndStroke={handleEndStroke}
          onCancelStroke={cancelStroke}
          onCursorMove={handleCursorMove}
        />
      </main>

      <ClearConfirmModal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        onConfirm={handleClearConfirm}
      />

      <HistoryModal
        roomId={roomId}
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
      />
    </div>
  );
};
