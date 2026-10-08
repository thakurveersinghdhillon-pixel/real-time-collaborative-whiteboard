import { useEffect, useState, useRef, useCallback } from 'react';
import {
  WhiteboardWsClient,
  ConnectionStatus,
  WsEventListener,
} from '../lib/websocket/client';
import { Stroke } from '@whiteboard/shared';

export function useWebSocket(customUrl?: string) {
  const url =
    customUrl || process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

  const clientRef = useRef<WhiteboardWsClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = new WhiteboardWsClient(url);
  }

  const client = clientRef.current;
  const [status, setStatus] = useState<ConnectionStatus>(client.getStatus());
  const [clientId] = useState<string>(client.getClientId());
  const [displayName, setDisplayNameState] = useState<string>(
    client.getDisplayName()
  );

  useEffect(() => {
    const unsubscribeStatus = client.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    client.connect();

    return () => {
      unsubscribeStatus();
      client.disconnect();
    };
  }, [client]);

  const setDisplayName = useCallback(
    (name: string) => {
      client.setDisplayName(name);
      setDisplayNameState(client.getDisplayName());
    },
    [client]
  );

  const setAuthToken = useCallback(
    (token: string | null) => {
      client.setAuthToken(token);
    },
    [client]
  );

  const joinRoom = useCallback(
    (roomId: string, name?: string, token?: string) => {
      client.joinRoom(roomId, name || displayName, token);
    },
    [client, displayName]
  );

  const leaveRoom = useCallback(
    (roomId: string) => {
      client.leaveRoom(roomId);
    },
    [client]
  );

  const sendCursorMove = useCallback(
    (roomId: string, x: number, y: number) => {
      client.sendCursorMove(roomId, x, y);
    },
    [client]
  );

  const sendStrokeAdd = useCallback(
    (roomId: string, stroke: Stroke) => {
      client.sendStrokeAdd(roomId, stroke);
    },
    [client]
  );

  const sendStrokeRemove = useCallback(
    (roomId: string, strokeId: string) => {
      client.sendStrokeRemove(roomId, strokeId);
    },
    [client]
  );

  const sendBoardClear = useCallback(
    (roomId: string) => {
      client.sendBoardClear(roomId);
    },
    [client]
  );

  const requestBoardState = useCallback(
    (roomId: string) => {
      client.requestBoardState(roomId);
    },
    [client]
  );

  const subscribe = useCallback(
    (listener: WsEventListener) => {
      return client.subscribe(listener);
    },
    [client]
  );

  return {
    status,
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
    requestBoardState,
    subscribe,
  };
}
