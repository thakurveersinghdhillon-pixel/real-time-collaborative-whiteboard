import { PresenceUser, BoardRole } from '@whiteboard/shared';

const USER_COLORS = [
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#8b5cf6', // Purple
  '#f97316', // Orange
  '#14b8a6', // Teal
];

export class PresenceManager {
  /**
   * Generates a clean default display name if none is provided.
   */
  static formatDisplayName(input?: string): string {
    if (!input || typeof input !== 'string' || input.trim().length === 0) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      return `User-${randomSuffix}`;
    }
    const trimmed = input.trim();
    return trimmed.length > 20 ? trimmed.substring(0, 20) : trimmed;
  }

  /**
   * Assigns a distinct vibrant color for remote cursor indicators.
   */
  static getUserColor(clientId: string): string {
    let hash = 0;
    for (let i = 0; i < clientId.length; i++) {
      hash = clientId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % USER_COLORS.length;
    return USER_COLORS[index];
  }

  /**
   * Constructs a new PresenceUser object.
   */
  static createPresenceUser(
    clientId: string,
    displayName?: string,
    userId?: string,
    role?: BoardRole,
  ): PresenceUser {
    return {
      clientId,
      displayName: this.formatDisplayName(displayName),
      cursor: null,
      color: this.getUserColor(clientId),
      userId,
      role,
    };
  }
}
