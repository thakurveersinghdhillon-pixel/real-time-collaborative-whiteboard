import { WsMessage, DistributedEvent } from '../types/events';

/**
 * Validates incoming WebSocket raw JSON messages defensively.
 */
export function isValidWsMessage(data: unknown): data is WsMessage {
  if (!data || typeof data !== 'object') return false;

  const msg = data as Record<string, unknown>;
  if (typeof msg.event !== 'string' || !msg.data || typeof msg.data !== 'object') {
    return false;
  }

  const payload = msg.data as Record<string, unknown>;

  switch (msg.event) {
    case 'auth:authenticate':
      return (
        typeof payload.token === 'string' &&
        payload.token.trim().length > 0
      );

    case 'auth:success':
      return true;

    case 'room:join':
      return (
        typeof payload.roomId === 'string' &&
        payload.roomId.trim().length > 0 &&
        typeof payload.clientId === 'string' &&
        payload.clientId.trim().length > 0
      );

    case 'room:leave':
      return (
        typeof payload.roomId === 'string' &&
        typeof payload.clientId === 'string'
      );

    case 'cursor:move':
      return (
        typeof payload.roomId === 'string' &&
        typeof payload.clientId === 'string' &&
        typeof payload.displayName === 'string' &&
        typeof payload.x === 'number' &&
        !isNaN(payload.x) &&
        typeof payload.y === 'number' &&
        !isNaN(payload.y)
      );

    case 'stroke:add': {
      const stroke = payload.stroke as Record<string, unknown> | undefined;
      return (
        typeof payload.roomId === 'string' &&
        typeof payload.clientId === 'string' &&
        !!stroke &&
        typeof stroke.id === 'string' &&
        Array.isArray(stroke.points) &&
        typeof stroke.color === 'string' &&
        typeof stroke.width === 'number' &&
        (stroke.tool === 'pen' || stroke.tool === 'eraser')
      );
    }

    case 'stroke:remove':
      return (
        typeof payload.roomId === 'string' &&
        typeof payload.clientId === 'string' &&
        typeof payload.strokeId === 'string'
      );

    case 'board:clear':
      return (
        typeof payload.roomId === 'string' &&
        typeof payload.clientId === 'string'
      );

    case 'board:request-state':
      return (
        typeof payload.roomId === 'string' &&
        typeof payload.clientId === 'string'
      );

    case 'room:joined':
    case 'room:user-joined':
    case 'room:user-left':
    case 'presence:state':
    case 'board:state':
      return true;

    default:
      return false;
  }
}

/**
 * Validates a Redis DistributedEvent envelope.
 */
export function isValidDistributedEvent(data: unknown): data is DistributedEvent {
  if (!data || typeof data !== 'object') return false;

  const event = data as Record<string, unknown>;
  return (
    typeof event.eventId === 'string' &&
    typeof event.eventType === 'string' &&
    typeof event.roomId === 'string' &&
    typeof event.originInstanceId === 'string' &&
    typeof event.timestamp === 'number' &&
    (event.version === undefined || typeof event.version === 'number') &&
    event.payload !== undefined
  );
}

