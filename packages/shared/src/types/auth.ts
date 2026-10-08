export type BoardRole = 'OWNER' | 'EDITOR' | 'VIEWER';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

export interface BoardSummary {
  id: string;
  roomId: string;
  name: string | null;
  ownerId: string | null;
  role: BoardRole;
  createdAt: string;
  updatedAt: string;
}

export interface BoardMemberDto {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  role: BoardRole;
}
