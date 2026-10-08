'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../lib/auth/AuthContext';
import { fetchApi } from '../../lib/api';
import { BoardSummary } from '@whiteboard/shared';
import {
  Palette,
  Plus,
  ArrowRight,
  LogOut,
  User,
  Shield,
  Edit,
  Eye,
  Clock,
  ExternalLink,
  Sparkles,
} from 'lucide-react';

export default function DashboardPage() {
  const { user, token, isLoading: authLoading, logout } = useAuth();
  const router = useRouter();

  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !token) {
      router.push('/login');
      return;
    }

    if (token) {
      loadBoards();
    }
  }, [authLoading, token, router]);

  const loadBoards = async () => {
    setLoadingBoards(true);
    try {
      const data = await fetchApi<BoardSummary[]>('/boards');
      setBoards(data);
    } catch (err: any) {
      console.error('Failed to load boards:', err);
    } finally {
      setLoadingBoards(false);
    }
  };

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const created = await fetchApi<BoardSummary>('/boards', {
        method: 'POST',
        body: JSON.stringify({ name: newBoardName }),
      });
      router.push(`/whiteboard/${created.roomId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create board');
      setCreating(false);
    }
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinRoomId.trim()) return;
    router.push(`/whiteboard/${joinRoomId.trim()}`);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  const getRoleBadge = (role: string) => {
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
            <Eye className="h-3 w-3" /> Viewer
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
              <Palette className="h-5 w-5" />
            </div>
            <span className="font-bold text-lg tracking-tight text-white">
              Whiteboard Studio
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 border border-slate-700/60">
              <User className="h-4 w-4 text-indigo-400" />
              <span className="text-sm font-medium text-slate-200">
                {user?.displayName}
              </span>
              <span className="text-xs text-slate-400">({user?.email})</span>
            </div>

            <button
              onClick={logout}
              className="flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white transition border border-slate-700"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create New Board Card */}
          <div className="rounded-2xl bg-gradient-to-br from-indigo-900/40 to-slate-800/80 p-6 border border-indigo-500/30 shadow-xl relative overflow-hidden">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">New Whiteboard</h3>
                <p className="text-xs text-slate-400">Start drawing with real-time sync</p>
              </div>
            </div>

            <form onSubmit={handleCreateBoard} className="space-y-4">
              <input
                type="text"
                placeholder="Whiteboard Name (optional)"
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm"
              />
              <button
                type="submit"
                disabled={creating}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition shadow-lg shadow-indigo-600/30 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {creating ? 'Creating...' : 'Create Whiteboard'}
              </button>
            </form>
          </div>

          {/* Join Room by ID Card */}
          <div className="rounded-2xl bg-slate-800/80 p-6 border border-slate-700 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-slate-700/50 text-slate-300 rounded-xl border border-slate-600">
                <ExternalLink className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Join Existing Room</h3>
                <p className="text-xs text-slate-400">Enter room ID or code to collaborate</p>
              </div>
            </div>

            <form onSubmit={handleJoinRoom} className="space-y-4">
              <input
                type="text"
                placeholder="e.g. room-1728383..."
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm"
              />
              <button
                type="submit"
                disabled={!joinRoomId.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
              >
                <span>Join Room</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        {/* My Boards Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white tracking-tight">Your Whiteboards</h2>
            <button
              onClick={loadBoards}
              className="text-xs text-indigo-400 hover:text-indigo-300 underline"
            >
              Refresh
            </button>
          </div>

          {loadingBoards ? (
            <div className="text-center py-12 text-slate-400">Loading whiteboards...</div>
          ) : boards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center text-slate-400 bg-slate-800/30">
              <Palette className="mx-auto h-12 w-12 text-slate-600 mb-3" />
              <h3 className="text-base font-semibold text-slate-300">No whiteboards found</h3>
              <p className="text-xs text-slate-500 mt-1">Create your first board above to start drawing!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {boards.map((b) => (
                <Link
                  key={b.id}
                  href={`/whiteboard/${b.roomId}`}
                  className="group rounded-xl bg-slate-800 p-5 border border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800/90 transition shadow-lg flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-white text-base group-hover:text-indigo-400 transition truncate">
                        {b.name || 'Untitled Whiteboard'}
                      </h3>
                      {getRoleBadge(b.role)}
                    </div>
                    <p className="text-xs font-mono text-slate-400 truncate">
                      ID: {b.roomId}
                    </p>
                  </div>

                  <div className="mt-6 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(b.updatedAt).toLocaleDateString()}
                    </span>
                    <span className="text-indigo-400 group-hover:translate-x-1 transition flex items-center gap-1 font-medium">
                      Open <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
