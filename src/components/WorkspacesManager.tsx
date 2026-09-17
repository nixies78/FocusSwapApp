import { useState, useMemo, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Search,
  Plus,
  ArrowLeft,
  Play,
  Pencil,
  Trash2,
  Globe,
  FileText,
  Terminal,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Action, CapturedLayout, Preset } from '../types';
import SnapshotCreatorModal from './SnapshotCreatorModal';

interface WorkspacesManagerProps {
  presets: Preset[];
  onLaunch: (preset: Preset) => void;
  onSwitchToGeneral: () => void;
  onEdit: (preset: Preset) => void;
  onCreateNew: (capturedLayout?: CapturedLayout) => void;
  onDelete: (presetId: string) => Promise<void>;
  onBackToLauncher: () => void;
}

export default function WorkspacesManager({
  presets,
  onLaunch,
  onSwitchToGeneral,
  onEdit,
  onCreateNew,
  onDelete,
  onBackToLauncher,
}: WorkspacesManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'shortcut'>('name');
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [autostart, setAutostart] = useState<boolean>(false);
  const [loadingAutostart, setLoadingAutostart] = useState<boolean>(false);

  useEffect(() => {
    invoke<boolean>('is_autostart_enabled')
      .then((enabled) => setAutostart(enabled))
      .catch((err) => console.error('Failed to check autostart status:', err));
  }, []);

  const handleToggleAutostart = async () => {
    setLoadingAutostart(true);
    try {
      const nextState = !autostart;
      const res = await invoke<boolean>('set_autostart_enabled', { enable: nextState });
      setAutostart(res);
    } catch (err) {
      console.error('Failed to toggle autostart:', err);
    } finally {
      setLoadingAutostart(false);
    }
  };

  const filteredPresets = useMemo(() => {
    let list = [...presets];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.actions.some(
            (a) =>
              a.executable.toLowerCase().includes(q) ||
              (a.title && a.title.toLowerCase().includes(q))
          )
      );
    }
    if (sortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => a.shortcut.localeCompare(b.shortcut));
    }
    return list;
  }, [presets, searchQuery, sortBy]);

  const handleDelete = async (presetId: string) => {
    try {
      setDeletingId(presetId);
      await onDelete(presetId);
    } finally {
      setDeletingId(null);
    }
  };

  const getActionIcon = (action: Action) => {
    const exe = action.executable.toLowerCase();
    if (exe.includes('chrome') || action.is_chrome_app) {
      return <Globe className="w-4 h-4 text-cyan-400" />;
    }
    if (exe.includes('cmd') || exe.includes('powershell') || exe.includes('wt')) {
      return <Terminal className="w-4 h-4 text-emerald-400" />;
    }
    if (exe.includes('notepad') || exe.includes('code')) {
      return <FileText className="w-4 h-4 text-amber-400" />;
    }
    return <Layers className="w-4 h-4 text-indigo-400" />;
  };

  return (
    <div className="w-full max-w-4xl h-[85vh] bg-[#12121c] border border-slate-700/80 rounded-2xl shadow-2xl shadow-black overflow-hidden flex flex-col text-slate-100 backdrop-blur-3xl animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/60">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBackToLauncher}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            title="Back to Launcher"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base font-bold tracking-wide text-slate-100 flex items-center gap-2">
              <span>Workspaces</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                {presets.length}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleToggleAutostart}
            disabled={loadingAutostart}
            title={
              autostart
                ? 'FocusDeck is set to automatically start on Windows boot. Click to disable.'
                : 'FocusDeck does not start on Windows boot. Click to enable.'
            }
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              autostart
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-slate-800/80 border-slate-700/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                autostart ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            <span>Start on Boot: {autostart ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => setIsSnapshotModalOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Create Workspace</span>
          </button>
        </div>
      </div>

      {/* Search & Sort Controls (Screenshot 1 Reference) */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800/60 bg-slate-950/40 gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search workspaces..."
            className="w-full bg-slate-900/80 border border-slate-700/60 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <span>Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-slate-900 border border-slate-700/60 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          >
            <option value="name">Name</option>
            <option value="shortcut">Key Shortcut</option>
          </select>
        </div>
      </div>

      {/* Workspaces List (Screenshot 1 Reference) */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {/* Pinned General Desktop Home State */}
        <div className="bg-gradient-to-r from-slate-900/90 via-slate-900 to-indigo-950/40 border border-indigo-500/30 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2.5">
              <div className="flex items-center justify-center w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold border border-indigo-500/30">
                0
              </div>
              <h3 className="text-sm font-bold text-white tracking-wide truncate">
                General Desktop
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Home State
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Default desktop session. Switching here applies switch-away action to active workspace and un-minimises any temporarily minimised windows.
            </p>
          </div>

          <div className="flex items-center space-x-2 shrink-0 pl-4">
            <button
              onClick={onSwitchToGeneral}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition shadow-sm cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Switch to General</span>
            </button>
          </div>
        </div>

        {filteredPresets.length === 0 ? (
          <div className="py-16 text-center text-slate-500 flex flex-col items-center">
            <Sparkles className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-400">No workspaces found</p>
            <p className="text-xs text-slate-500 mt-1">
              Click &quot;+ Create Workspace&quot; above to capture your multi-screen layout.
            </p>
          </div>
        ) : (
          filteredPresets.map((preset) => (
            <div
              key={preset.id}
              className="group bg-[#181824] hover:bg-[#1f1f2e] border border-slate-800/80 hover:border-slate-700 rounded-xl p-4 transition flex items-center justify-between shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-2.5">
                  <h3 className="text-sm font-bold text-slate-100 tracking-wide truncate">
                    {preset.name}
                  </h3>
                  {preset.shortcut && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      Key {preset.shortcut}
                    </span>
                  )}
                </div>

                {/* Apps preview row */}
                <div className="flex items-center space-x-2 flex-wrap gap-1.5 mt-2">
                  {preset.actions.map((act, actIdx) => (
                    <div
                      key={actIdx}
                      className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 shadow-sm text-xs"
                      title={act.title || act.executable}
                    >
                      {getActionIcon(act)}
                      <span className="text-[11px] font-mono text-slate-300 truncate max-w-[130px]">
                        {act.title || act.executable}
                      </span>
                      {act.on_switch_away && act.on_switch_away !== 'nothing' && (
                        <span
                          className={`text-[9px] font-mono px-1 rounded border ${
                            act.on_switch_away === 'temp_minimize'
                              ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                              : act.on_switch_away === 'minimize'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}
                        >
                          {act.on_switch_away === 'temp_minimize'
                            ? 'Temp Minimise'
                            : act.on_switch_away === 'minimize'
                            ? 'Minimise'
                            : 'Kill'}
                        </span>
                      )}
                    </div>
                  ))}
                  <span className="text-xs text-slate-500 font-medium ml-1">
                    ({preset.actions.length} {preset.actions.length === 1 ? 'app' : 'apps'})
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 shrink-0 pl-4">
                <button
                  onClick={() => onLaunch(preset)}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-lg text-xs font-medium transition border border-indigo-500/30"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Launch</span>
                </button>

                <button
                  onClick={() => onEdit(preset)}
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition"
                  title="Edit Workspace"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => handleDelete(preset.id)}
                  disabled={deletingId === preset.id}
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg border border-slate-700/60 transition disabled:opacity-50"
                  title="Delete Workspace"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Snapshot Creator Modal */}
      <SnapshotCreatorModal
        isOpen={isSnapshotModalOpen}
        onClose={() => setIsSnapshotModalOpen(false)}
        onCaptured={(layout) => {
          setIsSnapshotModalOpen(false);
          onCreateNew(layout);
        }}
      />
    </div>
  );
}
