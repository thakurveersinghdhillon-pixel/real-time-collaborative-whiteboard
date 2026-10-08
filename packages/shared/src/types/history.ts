import { Stroke } from './whiteboard';

export interface BoardHistoryItem {
  id: string;
  eventId: string;
  boardId: string;
  roomId: string;
  version: number;
  eventType: string;
  userId?: string | null;
  userDisplayName?: string | null;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface ReconstructedBoardState {
  roomId: string;
  version: number;
  strokes: Stroke[];
  snapshotUsed: boolean;
  eventsReplayed: number;
}

export interface BoardHistoryPaginatedResponse {
  roomId: string;
  items: BoardHistoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
