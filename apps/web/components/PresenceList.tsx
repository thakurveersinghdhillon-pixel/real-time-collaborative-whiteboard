'use client';

import React, { useState } from 'react';
import { Users, User, Check, Edit2 } from 'lucide-react';
import { PresenceUser } from '@whiteboard/shared';

interface PresenceListProps {
  users: PresenceUser[];
  localClientId: string;
  localDisplayName: string;
  onUpdateDisplayName: (newName: string) => void;
}

export const PresenceList: React.FC<PresenceListProps> = ({
  users,
  localClientId,
  localDisplayName,
  onUpdateDisplayName,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(localDisplayName);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim()) {
      onUpdateDisplayName(nameInput.trim());
      setIsEditingName(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
        title="View Room Members"
      >
        <Users className="w-3.5 h-3.5 text-indigo-500" />
        <span className="font-semibold">{users.length}</span>
        <span className="hidden sm:inline">Online</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-30 p-3 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-500" />
              Room Members ({users.length})
            </h3>
          </div>

          {/* User Display Name Editor */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg space-y-1.5">
            <span className="text-[10px] font-mono text-slate-400 uppercase">Your Display Name</span>
            {isEditingName ? (
              <form onSubmit={handleNameSubmit} className="flex items-center space-x-1">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={20}
                  className="w-full text-xs px-2 py-1 bg-white dark:bg-slate-900 border border-indigo-500 rounded text-slate-900 dark:text-slate-100 focus:outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  className="p-1 rounded bg-indigo-600 text-white hover:bg-indigo-500"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-200">
                <span>{localDisplayName} <span className="text-[10px] text-indigo-500 font-mono">(You)</span></span>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="text-slate-400 hover:text-indigo-500 p-0.5"
                  title="Edit Name"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Active Members List */}
          <div className="max-h-48 overflow-y-auto space-y-1">
            {users.map((u) => {
              const isLocal = u.clientId === localClientId;
              return (
                <div
                  key={u.clientId}
                  className="flex items-center justify-between p-1.5 rounded-lg text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <div className="flex items-center space-x-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: u.color || '#6366f1' }}
                    />
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {u.displayName} {isLocal && <span className="text-[10px] text-indigo-400 font-mono">(You)</span>}
                    </span>
                  </div>
                  <User className="w-3 h-3 text-slate-400" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
