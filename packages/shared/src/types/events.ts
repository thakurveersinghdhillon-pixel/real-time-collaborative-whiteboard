import { Stroke, Point } from './whiteboard';
import { BoardRole } from './auth';

export interface PresenceUser {
  clientId: string;
  displayName: string;
  cursor: Point | null;
  color: string;
  userId?: string;
  role?: BoardRole;
}

export type WsEventType =
  | 'auth:authenticate'
  | 'auth:success'
  | 'room:join'
  | 'room:leave'
  | 'room:joined'
  | 'room:user-joined'
  | 'room:user-left'
  | 'room:error'
  | 'presence:state'
  | 'cursor:move'
  | 'stroke:add'
  | 'stroke:remove'
  | 'board:clear'
  | 'board:request-state'
  | 'board:state';

export interface AuthAuthenticatePayload {
  token: string;
}

export interface AuthSuccessPayload {
  authenticated: boolean;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
}

export interface DistributedEvent<T = unknown> {
  eventId: string;
  eventType: WsEventType;
  roomId: string;
  originInstanceId: string;
  timestamp: number;
  version?: number;
  payload: T;
}

export interface RoomJoinPayload {
  roomId: string;
  clientId: string;
  displayName?: string;
  token?: string;
  knownVersion?: number;
}

export interface RoomLeavePayload {
  roomId: string;
  clientId: string;
}

export interface RoomJoinedPayload {
  roomId: string;
  strokes: Stroke[];
  presence: PresenceUser[];
  userRole?: BoardRole;
  version?: number;
}

export interface RoomErrorPayload {
  roomId?: string;
  message: string;
  code?: string;
}

export interface UserJoinedPayload {
  roomId: string;
  user: PresenceUser;
}

export interface UserLeftPayload {
  roomId: string;
  clientId: string;
}

export interface PresenceStatePayload {
  roomId: string;
  users: PresenceUser[];
}

export interface CursorMovePayload {
  roomId: string;
  clientId: string;
  displayName: string;
  x: number;
  y: number;
}

export interface StrokeAddPayload {
  roomId: string;
  stroke: Stroke;
  clientId: string;
  eventId?: string;
  version?: number;
}

export interface StrokeRemovePayload {
  roomId: string;
  strokeId: string;
  clientId: string;
  eventId?: string;
  version?: number;
}

export interface BoardClearPayload {
  roomId: string;
  clientId: string;
  eventId?: string;
  version?: number;
}

export interface BoardRequestStatePayload {
  roomId: string;
  clientId: string;
  knownVersion?: number;
}

export interface BoardStatePayload {
  roomId: string;
  strokes: Stroke[];
  version?: number;
}


export type WsMessage =
  | { event: 'auth:authenticate'; data: AuthAuthenticatePayload }
  | { event: 'auth:success'; data: AuthSuccessPayload }
  | { event: 'room:join'; data: RoomJoinPayload }
  | { event: 'room:leave'; data: RoomLeavePayload }
  | { event: 'room:joined'; data: RoomJoinedPayload }
  | { event: 'room:user-joined'; data: UserJoinedPayload }
  | { event: 'room:user-left'; data: UserLeftPayload }
  | { event: 'room:error'; data: RoomErrorPayload }
  | { event: 'presence:state'; data: PresenceStatePayload }
  | { event: 'cursor:move'; data: CursorMovePayload }
  | { event: 'stroke:add'; data: StrokeAddPayload }
  | { event: 'stroke:remove'; data: StrokeRemovePayload }
  | { event: 'board:clear'; data: BoardClearPayload }
  | { event: 'board:request-state'; data: BoardRequestStatePayload }
  | { event: 'board:state'; data: BoardStatePayload };
