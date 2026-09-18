import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  X,
  Camera,
  Plus,
  Trash2,
  Sparkles,
  Play,
  ShieldCheck,
  Check,
  AlertCircle,
} from 'lucide-react';
import {
  CleanupConfig,
  CleanupRule,
  CleanupRuleAction,
  CapturedLayout,
  CleanupSummary,
} from '../types';

interface SmartCleanupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunCleanup: () => Promise<CleanupSummary | undefined>;
}

export default function SmartCleanupModal({
  isOpen,
  onClose,
  onRunCleanup,
}: SmartCleanupModalProps) {
  const [config, setConfig] = useState<CleanupConfig>({
    default_action: 'minimize',
    rules: [],
  });
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Form state for adding custom rule
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleExe, setNewRuleExe] = useState('');
  const [newRuleTitle, setNewRuleTitle] = useState('');
  const [newRuleAction, setNewRuleAction] = useState<CleanupRuleAction>('minimize');

  const loadConfig = async () => {
    try {
      const cfg = await invoke<CleanupConfig>('get_cleanup_config');
      setConfig(cfg || { default_action: 'minimize', rules: [] });
    } catch (err) {
      console.error('Failed to load cleanup config:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadConfig();
      setStatusMessage(null);
      setShowAddForm(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCaptureScreen = async () => {
    setIsCapturing(true);
    try {
      const layout = await invoke<CapturedLayout>('capture_window_layout');
      if (layout && layout.windows) {
        const updatedRules = [...config.rules];

        for (const win of layout.windows) {
          const exe = win.executable.toLowerCase();
          const title = win.title;

          // Check if already covered by an existing rule
          const exists = updatedRules.some((r) => {
            if (r.executable && r.executable.toLowerCase() === exe) {
              if (r.title_contains) {
                return title.toLowerCase().includes(r.title_contains.toLowerCase());
              }
              return true;
            }
            if (r.title_contains && title.toLowerCase().includes(r.title_contains.toLowerCase())) {
              return true;
            }
            return false;
          });

          if (!exists) {
            let suggestedAction: CleanupRuleAction = 'minimize';
            let titleKeyword: string | undefined = undefined;
            let displayName = win.title;

            if (title.length > 25) {
              const dashIdx = title.lastIndexOf(' - ');
              if (dashIdx > 0) {
                displayName = title.substring(dashIdx + 3).trim();
              } else {
                displayName = title.substring(0, 25) + '...';
              }
            }

            const titleLower = title.toLowerCase();
            if (titleLower.includes('youtube')) {
              titleKeyword = 'YouTube';
              displayName = 'YouTube';
              suggestedAction = 'kill';
            } else if (titleLower.includes('notepad')) {
              displayName = 'Notepad';
              suggestedAction = 'kill';
            } else if (titleLower.includes('spotify')) {
              displayName = 'Spotify';
              suggestedAction = 'keep';
            }

            updatedRules.push({
              id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              name: displayName || win.executable,
              executable: win.executable,
              title_contains: titleKeyword,
              action: suggestedAction,
            });
          }
        }

        setConfig((prev) => ({ ...prev, rules: updatedRules }));
        setStatusMessage(`Captured ${layout.windows.length} window(s) from screen`);
        setTimeout(() => setStatusMessage(null), 3500);
      }
    } catch (err) {
      console.error('Failed to capture windows:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleAddCustomRule = () => {
    if (!newRuleName.trim() && !newRuleExe.trim() && !newRuleTitle.trim()) return;

    const newRule: CleanupRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: newRuleName.trim() || newRuleExe.trim() || newRuleTitle.trim() || 'Custom Rule',
      executable: newRuleExe.trim() || undefined,
      title_contains: newRuleTitle.trim() || undefined,
      action: newRuleAction,
    };

    setConfig((prev) => ({ ...prev, rules: [...prev.rules, newRule] }));
    setNewRuleName('');
    setNewRuleExe('');
    setNewRuleTitle('');
    setNewRuleAction('minimize');
    setShowAddForm(false);
  };

  const handleUpdateRuleAction = (ruleId: string, action: CleanupRuleAction) => {
    setConfig((prev) => ({
      ...prev,
      rules: prev.rules.map((r) => (r.id === ruleId ? { ...r, action } : r)),
    }));
  };

  const handleDeleteRule = (ruleId: string) => {
    setConfig((prev) => ({
      ...prev,
      rules: prev.rules.filter((r) => r.id !== ruleId),
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await invoke('save_cleanup_config', { cleanup: config });
      setStatusMessage('Rules saved successfully');
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      console.error('Failed to save cleanup config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndRun = async () => {
    setIsSaving(true);
    try {
      await invoke('save_cleanup_config', { cleanup: config });
      onClose();
      await onRunCleanup();
    } catch (err) {
      console.error('Failed to save and run cleanup:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Smart Cleanup Rules</h2>
              <p className="text-xs text-slate-400">
                Customise how open applications and windows behave when cleaning your screen
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Default Policy Card */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <ShieldCheck size={16} className="text-indigo-400" />
                <span className="text-xs font-semibold text-slate-200">
                  Default for Unlisted Windows
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Action applied to all open windows that do not match a custom rule
              </p>
            </div>

            <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 rounded-lg p-1">
              {[
                { id: 'minimize', label: 'Minimise', color: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40' },
                { id: 'keep', label: 'Keep', color: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40' },
                { id: 'close', label: 'Close', color: 'bg-amber-500/20 text-amber-200 border-amber-500/40' },
                { id: 'kill', label: 'Kill', color: 'bg-rose-500/20 text-rose-200 border-rose-500/40' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() =>
                    setConfig((prev) => ({
                      ...prev,
                      default_action: opt.id as CleanupRuleAction,
                    }))
                  }
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition cursor-pointer ${
                    config.default_action === opt.id
                      ? `${opt.color} border font-semibold shadow-sm`
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={handleCaptureScreen}
              disabled={isCapturing}
              className="flex items-center space-x-2 px-3.5 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white border border-indigo-500/40 rounded-xl text-xs font-medium transition cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <Camera size={14} className={isCapturing ? 'animate-pulse' : ''} />
              <span>{isCapturing ? 'Capturing Screen...' : 'Capture Current Windows'}</span>
            </button>

            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-xs font-medium transition cursor-pointer"
            >
              <Plus size={14} />
              <span>Add Custom Rule</span>
            </button>
          </div>

          {/* Inline Add Custom Rule Form */}
          {showAddForm && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
              <span className="text-xs font-semibold text-white block">New Custom Rule</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 font-mono mb-1">Friendly Name</label>
                  <input
                    type="text"
                    value={newRuleName}
                    onChange={(e) => setNewRuleName(e.target.value)}
                    placeholder="e.g. Work Notepad"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 font-mono mb-1">Executable</label>
                  <input
                    type="text"
                    value={newRuleExe}
                    onChange={(e) => setNewRuleExe(e.target.value)}
                    placeholder="e.g. notepad.exe"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 font-mono mb-1">Title Contains (Optional)</label>
                  <input
                    type="text"
                    value={newRuleTitle}
                    onChange={(e) => setNewRuleTitle(e.target.value)}
                    placeholder="e.g. YouTube"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-400">Rule Action:</span>
                  {(['keep', 'minimize', 'kill', 'close'] as CleanupRuleAction[]).map((act) => (
                    <button
                      key={act}
                      type="button"
                      onClick={() => setNewRuleAction(act)}
                      className={`px-2 py-0.5 text-xs rounded border capitalize transition cursor-pointer ${
                        newRuleAction === act
                          ? act === 'keep'
                            ? 'bg-emerald-500/25 text-emerald-200 border-emerald-500'
                            : act === 'kill'
                            ? 'bg-rose-500/25 text-rose-200 border-rose-500'
                            : act === 'close'
                            ? 'bg-amber-500/25 text-amber-200 border-amber-500'
                            : 'bg-cyan-500/25 text-cyan-200 border-cyan-500'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      {act}
                    </button>
                  ))}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-1 text-xs text-slate-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddCustomRule}
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Rules List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
              <span>Specific Window Rules ({config.rules.length})</span>
            </div>

            {config.rules.length === 0 ? (
              <div className="bg-slate-950/40 border border-dashed border-slate-800 rounded-xl p-8 text-center space-y-2">
                <AlertCircle size={24} className="mx-auto text-slate-600" />
                <p className="text-xs text-slate-400 font-medium">No custom rules configured</p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  By default, Smart Cleanup will minimize all open windows. Click{' '}
                  <strong className="text-slate-400">&quot;Capture Current Windows&quot;</strong> above to
                  auto-detect your apps and set custom kill, close, or keep rules!
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {config.rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between bg-slate-950/60 border border-slate-800/90 hover:border-slate-700/80 rounded-xl px-3.5 py-2.5 transition"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-medium text-white truncate max-w-[200px]">
                          {rule.name}
                        </span>
                        {rule.executable && (
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded truncate max-w-[140px]">
                            {rule.executable}
                          </span>
                        )}
                        {rule.title_contains && (
                          <span className="text-[10px] font-mono text-indigo-400/90 bg-indigo-950/40 border border-indigo-900/50 px-1.5 py-0.5 rounded truncate max-w-[140px]">
                            *{rule.title_contains}*
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                        {(['keep', 'minimize', 'kill', 'close'] as CleanupRuleAction[]).map((act) => {
                          const isSelected = rule.action === act;
                          return (
                            <button
                              key={act}
                              onClick={() => handleUpdateRuleAction(rule.id, act)}
                              className={`px-2 py-0.5 text-[11px] rounded capitalize transition cursor-pointer font-medium ${
                                isSelected
                                  ? act === 'keep'
                                    ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-500/60 shadow-sm'
                                    : act === 'kill'
                                    ? 'bg-rose-500/25 text-rose-200 border border-rose-500/60 shadow-sm'
                                    : act === 'close'
                                    ? 'bg-amber-500/25 text-amber-200 border border-amber-500/60 shadow-sm'
                                    : 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/60 shadow-sm'
                                  : 'text-slate-500 hover:text-slate-300'
                              }`}
                            >
                              {act}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition cursor-pointer"
                        title="Delete Rule"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/80">
          <button
            onClick={handleSaveAndRun}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer active:scale-95 shadow-md shadow-indigo-950"
          >
            <Play size={13} fill="currentColor" />
            <span>Run Smart Cleanup Now</span>
          </button>

          <div className="flex items-center space-x-3">
            {statusMessage && (
              <span className="text-xs text-emerald-400 flex items-center space-x-1 animate-in fade-in duration-150">
                <Check size={14} />
                <span>{statusMessage}</span>
              </span>
            )}
            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Rules'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
