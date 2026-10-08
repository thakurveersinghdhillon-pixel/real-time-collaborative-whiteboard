'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../lib/api';
import { BoardMemberDto, BoardRole } from '@whiteboard/shared';
import { X, UserPlus, Trash2, Shield, Edit, Eye, AlertCircle, Check } from 'lucide-react';

interface MemberManagementModalProps {
  roomId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const MemberManagementModal: React.FC<MemberManagementModalProps> = ({
  roomId,
  isOpen,
  onClose,
}) => {
  const [members, setMembers] = useState<BoardMemberDto[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<BoardRole>('EDITOR');
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi<BoardMemberDto[]>(`/boards/${roomId}/members`);
      setMembers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load board members');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (isOpen) {
      loadMembers();
    }
  }, [isOpen, loadMembers]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setAdding(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await fetchApi<BoardMemberDto>(`/boards/${roomId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), role }),
      });

      setSuccess(`User ${updated.email} added as ${updated.role}`);
      setEmail('');
      loadMembers();
    } catch (err: any) {
      setError(err.message || 'Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    setError(null);
    setSuccess(null);
    try {
      await fetchApi(`/boards/${roomId}/members/${targetUserId}`, {
        method: 'DELETE',
      });
      setMembers((prev) => prev.filter((m) => m.userId !== targetUserId));
      setSuccess('Member removed successfully');
    } catch (err: any) {
      setError(err.message || 'Failed to remove member');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-slate-800 p-6 shadow-2xl border border-slate-700 text-slate-100 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-700 pb-4">
          <div>
            <h3 className="text-xl font-bold text-white">Board Member Management</h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">Room ID: {roomId}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-400">
            <Check className="h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Add Member Form */}
        <form onSubmit={handleAddMember} className="space-y-3 bg-slate-900/60 p-4 rounded-xl border border-slate-700">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
            Add / Invite Member
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as BoardRole)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="EDITOR">Editor</option>
              <option value="VIEWER">Viewer</option>
              <option value="OWNER">Owner</option>
            </select>
            <button
              type="submit"
              disabled={adding || !email.trim()}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" />
              <span>{adding ? 'Adding...' : 'Add'}</span>
            </button>
          </div>
        </form>

        {/* Members List */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Current Members ({members.length})
          </h4>

          {loading ? (
            <div className="py-6 text-center text-xs text-slate-400">Loading members...</div>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-700/60"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-white">{m.displayName}</p>
                    <p className="text-xs text-slate-400">{m.email}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300 border border-slate-700">
                      {m.role === 'OWNER' && <Shield className="h-3 w-3 text-amber-400" />}
                      {m.role === 'EDITOR' && <Edit className="h-3 w-3 text-indigo-400" />}
                      {m.role === 'VIEWER' && <Eye className="h-3 w-3 text-slate-400" />}
                      {m.role}
                    </span>

                    {m.role !== 'OWNER' && (
                      <button
                        onClick={() => handleRemoveMember(m.userId)}
                        className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition"
                        title="Remove member"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
