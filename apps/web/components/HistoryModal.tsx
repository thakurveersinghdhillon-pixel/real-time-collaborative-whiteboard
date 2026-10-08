'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { History, X, Clock, ChevronLeft, ChevronRight, Eye, Calendar, User, ShieldAlert, Sparkles, RefreshCw } from 'lucide-react';
import { BoardHistoryItem, ReconstructedBoardState, Stroke } from '@whiteboard/shared';
import { useAuth } from '../lib/auth/AuthContext';
import { WhiteboardCanvas } from './WhiteboardCanvas';

interface HistoryModalProps {
  roomId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ roomId, isOpen, onClose }) => {
  const { token } = useAuth();
  const [historyItems, setHistoryItems] = useState<BoardHistoryItem[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Historical Inspection State
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [reconstructedState, setReconstructedState] = useState<ReconstructedBoardState | null>(null);
  const [loadingReconstruction, setLoadingReconstruction] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!token || !isOpen) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/boards/${roomId}/history?limit=50&order=desc`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to load history: ${res.statusText}`);
      const data = await res.json();
      setHistoryItems(data.items || []);
      setTotalEvents(data.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch history');
    } finally {
      setLoading(false);
    }
  }, [token, roomId, isOpen]);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
      setSelectedVersion(null);
      setReconstructedState(null);
    }
  }, [isOpen, fetchHistory]);

  const inspectVersion = async (version: number) => {
    if (!token) return;
    setSelectedVersion(version);
    setLoadingReconstruction(true);

    try {
      const res = await fetch(`/api/boards/${roomId}/history/${version}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to load version ${version}`);
      const data: ReconstructedBoardState = await res.json();
      setReconstructedState(data);
    } catch (err: any) {
      setError(err.message || `Failed to reconstruct version ${version}`);
    } finally {
      setLoadingReconstruction(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl h-[85vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Board History & Audit Trail
                <span className="text-xs font-mono font-normal text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  {totalEvents} events
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Immutable event history, versions, and historical reconstruction
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={fetchHistory}
              disabled={loading}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Refresh History"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body: Left Timeline, Right Historical Viewer */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Panel: Audit Trail Timeline */}
          <div className="w-80 md:w-96 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/30 dark:bg-slate-950/20 shrink-0">
            <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Event Log (Newest First)
            </div>

            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mb-2 text-indigo-500" />
                <span className="text-xs font-medium">Loading history audit log...</span>
              </div>
            ) : historyItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400">
                <Clock className="w-8 h-8 mb-2 stroke-1 opacity-50" />
                <p className="text-xs font-semibold">No historical events recorded yet.</p>
                <p className="text-[11px] text-slate-500 mt-1">Durable mutations will appear here as they occur.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-2 space-y-1">
                {historyItems.map((item) => {
                  const isSelected = selectedVersion === item.version;
                  return (
                    <div
                      key={item.id}
                      onClick={() => inspectVersion(item.version)}
                      className={`p-3 rounded-xl cursor-pointer transition flex flex-col gap-1.5 ${
                        isSelected
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 shadow-sm'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded">
                          v{item.version}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {item.eventType === 'stroke:add' && '✏️ Added Stroke'}
                          {item.eventType === 'stroke:remove' && '🗑️ Erased Stroke'}
                          {item.eventType === 'board:clear' && '🧹 Cleared Whiteboard'}
                          {item.eventType !== 'stroke:add' && item.eventType !== 'stroke:remove' && item.eventType !== 'board:clear' && item.eventType}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {item.userDisplayName || 'Unknown User'}
                        </span>
                      </div>

                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        ID: {item.eventId}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Panel: Reconstructed Historical Canvas Preview */}
          <div className="flex-1 flex flex-col bg-slate-900/5 dark:bg-slate-950/40 overflow-hidden relative">
            {selectedVersion === null ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <Eye className="w-12 h-12 mb-3 stroke-1 text-indigo-500/60" />
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Select a Version to Inspect</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
                  Click any version in the left audit trail to reconstruct and preview the exact historical board state at that point in time.
                </p>
              </div>
            ) : loadingReconstruction ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-indigo-500">
                <RefreshCw className="w-8 h-8 animate-spin mb-3" />
                <p className="text-xs font-semibold">Reconstructing state at version {selectedVersion} from PostgreSQL snapshot & events...</p>
              </div>
            ) : reconstructedState ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Historical Header Indicator */}
                <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-between text-xs shrink-0">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-500" />
                    <span className="font-semibold">READ-ONLY HISTORICAL VIEW: Version {reconstructedState.version}</span>
                    {reconstructedState.snapshotUsed && (
                      <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded text-[10px] font-mono">
                        <Sparkles className="w-3 h-3" /> Snapshot Replayed ({reconstructedState.eventsReplayed} events)
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs">
                    {reconstructedState.strokes.length} strokes
                  </div>
                </div>

                {/* Read-Only Canvas Container */}
                <div className="flex-1 relative overflow-hidden bg-white dark:bg-slate-950">
                  <WhiteboardCanvas
                    strokes={reconstructedState.strokes}
                    activeStroke={null}
                    tool="pen"
                    presenceUsers={[]}
                    localClientId=""
                    isViewer={true}
                    onStartStroke={() => {}}
                    onAddPoint={() => {}}
                    onEndStroke={() => {}}
                    onCancelStroke={() => {}}
                    onCursorMove={() => {}}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-red-500">
                {error || 'Failed to load historical version'}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
