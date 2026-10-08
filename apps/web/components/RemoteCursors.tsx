'use client';

import React from 'react';
import { PresenceUser } from '@whiteboard/shared';

interface RemoteCursorsProps {
  users: PresenceUser[];
  localClientId: string;
}

export const RemoteCursors: React.FC<RemoteCursorsProps> = ({
  users,
  localClientId,
}) => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {users
        .filter((u) => u.clientId !== localClientId && u.cursor !== null)
        .map((user) => (
          <div
            key={user.clientId}
            className="absolute transition-all duration-75 ease-out flex items-center gap-1.5"
            style={{
              transform: `translate3d(${user.cursor!.x}px, ${user.cursor!.y}px, 0)`,
              willChange: 'transform',
            }}
          >
            {/* SVG Pointer Arrow */}
            <svg
              className="w-5 h-5 -rotate-45 drop-shadow-md"
              viewBox="0 0 24 24"
              fill={user.color || '#6366f1'}
              stroke="#ffffff"
              strokeWidth="1.5"
            >
              <path d="M3 3l7 18 3-7 7-3L3 3z" />
            </svg>

            {/* User Display Name Tag */}
            <span
              className="text-[11px] font-medium px-2 py-0.5 rounded-full text-white shadow-md whitespace-nowrap"
              style={{ backgroundColor: user.color || '#6366f1' }}
            >
              {user.displayName}
            </span>
          </div>
        ))}
    </div>
  );
};
