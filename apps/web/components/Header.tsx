'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Palette, Copy, Check, Wifi, WifiOff, Activity, Link as LinkIcon, Users, LayoutDashboard, Shield, Edit, Eye, History } from 'lucide-react';
import { ConnectionStatus } from '../lib/websocket/client';
import { PresenceUser, BoardRole } from '@whiteboard/shared';
import { PresenceList } from './PresenceList';
import { MemberManagementModal } from './MemberManagementModal';
import { useAuth } from '../lib/auth/AuthContext';

interface HeaderProps {
  roomId: string;
  wsStatus: ConnectionStatus;
  clientId: string;
  displayName: string;
  presenceUsers: PresenceUser[];
  userRole?: BoardRole;
  onUpdateDisplayName: (name: string) => void;
  onOpenHistory?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  roomId,
  wsStatus,
  clientId,
  displayName,
  presenceUsers,
  userRole = 'EDITOR',
  onUpdateDisplayName,
  onOpenHistory,
}) => {
  const [copied, setCopied] = useState(false);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const { user } = useAuth();

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      const roomUrl = `${window.location.origin}/whiteboard/${roomId}`;
      navigator.clipboard.writeText(roomUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getRoleBadge = (role: BoardRole) => {
    switch (role) {
      case 'OWNER':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400 border border-amber-500/20">
            <Shield className="h-3 w-3" /> Owner
          </span>
        );
      case 'EDITOR':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-400 border border-indigo-500/20">
            <Edit className="h-3 w-3" /> Editor
          </span>
        );
      case 'VIEWER':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2.5 py-0.5 text-xs font-semibold text-slate-400 border border-slate-500/20">
            <Eye className="h-3 w-3" /> Read-Only
          </span>
        );
    }
  };

  return (
    <>
      <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center space-x-3">
          <Link
            href="/dashboard"
            className="flex items-center space-x-2 text-slate-700 dark:text-slate-300 hover:text-indigo-600 transition"
            title="Go to Dashboard"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Palette className="w-5 h-5" />
            </div>
            <span className="text-base font-semibold hidden md:inline">
              Whiteboard
            </span>
          </Link>

          <div className="flex items-center space-x-2">
            {/* Room ID Badge & Copy Link Button */}
            <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-mono text-indigo-700 dark:text-indigo-300">
              <LinkIcon className="w-3.5 h-3.5" />
              <span className="font-semibold">{roomId}</span>
              <button
                onClick={handleCopyLink}
                className="p-1 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded transition ml-1"
                title="Copy Room Link"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-indigo-500" />
                )}
              </button>
            </div>

            {/* User Role Badge */}
            {getRoleBadge(userRole)}
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Dashboard Link */}
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition border border-slate-200 dark:border-slate-700"
          >
            <LayoutDashboard className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>

          {/* History & Audit Trail Button */}
          {onOpenHistory && (
            <button
              onClick={onOpenHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition border border-slate-200 dark:border-slate-700"
              title="View History & Audit Trail"
            >
              <History className="w-3.5 h-3.5 text-indigo-500" />
              <span className="hidden sm:inline">History</span>
            </button>
          )}

          {/* Manage Members Button (OWNER only) */}
          {userRole === 'OWNER' && user && (
            <button
              onClick={() => setIsMemberModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition shadow-sm"
              title="Manage Members & Access"
            >
              <Users className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Share & Members</span>
            </button>
          )}

          {/* Presence Users List */}
          <PresenceList
            users={presenceUsers}
            localClientId={clientId}
            localDisplayName={displayName}
            onUpdateDisplayName={onUpdateDisplayName}
          />

          {/* Live WebSocket Status Badge */}
          <div className="flex items-center space-x-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {(wsStatus === 'authenticated' || wsStatus === 'connected') && (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold hidden md:inline">
                  Live Sync
                </span>
              </>
            )}
            {(wsStatus === 'connecting' || wsStatus === 'authenticating') && (
              <>
                <Activity className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                <span className="text-amber-600 dark:text-amber-400 hidden md:inline">
                  {wsStatus === 'authenticating' ? 'Authenticating...' : 'Connecting...'}
                </span>
              </>
            )}
            {(wsStatus === 'disconnected' || wsStatus === 'error') && (
              <>
                <WifiOff className="w-3.5 h-3.5 text-red-500" />
                <span className="text-red-500 hidden md:inline">Disconnected</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Member Management Modal */}
      {userRole === 'OWNER' && (
        <MemberManagementModal
          roomId={roomId}
          isOpen={isMemberModalOpen}
          onClose={() => setIsMemberModalOpen(false)}
        />
      )}
    </>
  );
};
