import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Monitor,
  ChevronDown,
  ChevronUp,
  Globe,
  FileText,
  Terminal,
  Layers,
  Save,
  Trash2,
  Plus,
  ArrowLeft,
} from 'lucide-react';
import { Action, CapturedLayout, MonitorInfo, Placement, Preset, SwitchAwayAction, ChromeProfile } from '../types';

interface WorkspaceEditorProps {
  initialPreset?: Preset | null;
  capturedLayout?: CapturedLayout | null;
  allPresets: Preset[];
  onSave: (preset: Preset) => Promise<void>;
  onCancel: () => void;
}

export default function WorkspaceEditor({
  initialPreset,
  capturedLayout,
  allPresets,
  onSave,
  onCancel,
}: WorkspaceEditorProps) {
  // Determine monitors
  const monitors: MonitorInfo[] = capturedLayout?.monitors || [
    { index: 1, name: 'Screen 1', x: 0, y: 0, width: 1920, height: 1080, is_primary: true },
    { index: 2, name: 'Screen 2', x: 1920, y: 0, width: 1920, height: 1080, is_primary: false },
  ];

  const [name, setName] = useState(
    initialPreset?.name || `Workspace ${allPresets.length + 1}`
  );
  const [shortcut, setShortcut] = useState(
    initialPreset?.shortcut || `${Math.min(9, allPresets.length + 1)}`
  );
  const [createDesktopShortcut, setCreateDesktopShortcut] = useState(false);
  const [moveExistingWindows, setMoveExistingWindows] = useState(true);

  const [actions, setActions] = useState<Action[]>(() => {
    if (initialPreset) {
      return initialPreset.actions;
    }
    if (capturedLayout && capturedLayout.windows.length > 0) {
      return capturedLayout.windows.map((w) => {
        let isChromeApp = w.is_chrome;
        let args: string[] = [];

        if (w.is_chrome) {
          const cleanTitle = w.title.toLowerCase();
          if (w.suggested_url) {
            args = [`--app=${w.suggested_url}`, '--new-window'];
          } else if (cleanTitle.includes('youtube')) {
            if (cleanTitle.includes('subscription')) {
              args = ['--app=https://www.youtube.com/feed/subscriptions', '--new-window'];
            } else {
              args = ['--app=https://www.youtube.com', '--new-window'];
            }
          } else if (cleanTitle.includes('calendar')) {
            args = ['--app=https://calendar.google.com', '--new-window'];
          } else if (cleanTitle.includes('gemini')) {
            args = ['--app=https://gemini.google.com/app', '--new-window'];
          } else if (cleanTitle.includes('notion')) {
            args = ['--app=https://www.notion.so', '--new-window'];
          } else if (cleanTitle.includes('gmail') || cleanTitle.includes('inbox')) {
            args = ['--app=https://mail.google.com', '--new-window'];
          } else if (cleanTitle.includes('github')) {
            args = ['--app=https://github.com', '--new-window'];
          } else if (cleanTitle.includes('reddit')) {
            args = ['--app=https://www.reddit.com', '--new-window'];
          } else if (cleanTitle.includes('spotify')) {
            args = ['--app=https://open.spotify.com', '--new-window'];
          } else if (cleanTitle.includes('twitch')) {
            args = ['--app=https://www.twitch.tv', '--new-window'];
          } else if (cleanTitle.includes('chatgpt') || cleanTitle.includes('chat.openai')) {
            args = ['--app=https://chatgpt.com', '--new-window'];
          } else if (cleanTitle.includes('netflix')) {
            args = ['--app=https://www.netflix.com', '--new-window'];
          } else {
            const domainMatch = w.title.match(/([a-zA-Z0-9-]+\.(?:com|org|net|io|app|co|uk|de|ai|tv|so|me|dev))(?:\/|$|\s)/i);
            if (domainMatch) {
              args = [`--app=https://${domainMatch[1]}`, '--new-window'];
            } else {
              args = ['--app=https://google.com', '--new-window'];
            }
          }
        } else {
          // Detect open file/project path inside title brackets (e.g. [C:\Users\User\PrintPrep.blend])
          const match = w.title.match(/\[([a-zA-Z]:\\[^\]]+)\]/);
          if (match && match[1]) {
            args = [match[1]];
          }
        }

        return {
          type: 'launch',
          executable: w.process_path || w.executable,
          title: w.title,
          is_chrome_app: isChromeApp,
          args,
          placement: {
            x: w.x,
            y: w.y,
            width: w.width,
            height: w.height,
            screen: w.screen_index,
            maximized: w.is_maximized,
          },
        };
      });
    }
    return [
      {
        type: 'launch',
        executable: 'chrome.exe',
        title: 'Google Chrome',
        is_chrome_app: true,
        args: ['--app=https://calendar.google.com', '--new-window'],
        placement: { x: 100, y: 100, width: 1200, height: 800, screen: 1, maximized: false },
      },
    ];
  });

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [chromeProfiles, setChromeProfiles] = useState<ChromeProfile[]>([]);

  useEffect(() => {
    invoke<ChromeProfile[]>('get_chrome_profiles')
      .then((profiles) => setChromeProfiles(profiles))
      .catch((err) => console.error('Failed to load Chrome profiles:', err));
  }, []);

  const toggleExpand = (index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  };

  const handleRemoveAction = (index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
    if (expandedIndex === index) setExpandedIndex(null);
  };

  const handleUpdateAction = (index: number, updated: Partial<Action>) => {
    setActions((prev) =>
      prev.map((act, i) => (i === index ? { ...act, ...updated } : act))
    );
  };

  const handleUpdatePlacement = (index: number, updated: Partial<Placement>) => {
    setActions((prev) =>
      prev.map((act, i) => {
        if (i === index) {
          const currentPlacement = act.placement || {
            x: 100,
            y: 100,
            width: 800,
            height: 600,
            screen: 1,
            maximized: false,
          };
          return {
            ...act,
            placement: { ...currentPlacement, ...updated },
          };
        }
        return act;
      })
    );
  };

  const handleChromeAppToggle = (index: number, isChecked: boolean) => {
    const act = actions[index];
    let url = '';
    let profile = '';
    for (const arg of act.args) {
      if (arg.startsWith('--app=')) {
        url = arg.substring(6).replace(/^["']|["']$/g, '');
      } else if (arg.startsWith('http://') || arg.startsWith('https://')) {
        url = arg.replace(/^["']|["']$/g, '');
      } else if (arg.startsWith('--profile-directory=')) {
        profile = arg.substring(20).replace(/^["']|["']$/g, '');
      }
    }
    if (!url) {
      url = 'https://calendar.google.com';
    }

    const newArgs: string[] = [];
    if (profile) {
      newArgs.push(`--profile-directory="${profile}"`);
    }
    if (isChecked) {
      newArgs.push(`--app=${url}`, '--new-window');
    } else {
      newArgs.push('--new-window', url);
    }

    handleUpdateAction(index, {
      is_chrome_app: isChecked,
      args: newArgs,
    });
  };

  const handleUrlChange = (index: number, newUrl: string) => {
    const act = actions[index];
    let profile = '';
    for (const arg of act.args) {
      if (arg.startsWith('--profile-directory=')) {
        profile = arg.substring(20).replace(/^["']|["']$/g, '');
      }
    }

    const newArgs: string[] = [];
    if (profile) {
      newArgs.push(`--profile-directory="${profile}"`);
    }
    if (act.is_chrome_app) {
      newArgs.push(`--app=${newUrl}`, '--new-window');
    } else {
      newArgs.push('--new-window', newUrl);
    }

    handleUpdateAction(index, {
      args: newArgs,
    });
  };

  const handleChromeProfileChange = (index: number, newProfile: string) => {
    const act = actions[index];
    let url = '';
    for (const arg of act.args) {
      if (arg.startsWith('--app=')) {
        url = arg.substring(6).replace(/^["']|["']$/g, '');
      } else if (arg.startsWith('http://') || arg.startsWith('https://')) {
        url = arg.replace(/^["']|["']$/g, '');
      }
    }
    if (!url) {
      url = 'https://calendar.google.com';
    }

    const newArgs: string[] = [];
    if (newProfile) {
      newArgs.push(`--profile-directory="${newProfile}"`);
    }
    if (act.is_chrome_app) {
      newArgs.push(`--app=${url}`, '--new-window');
    } else {
      newArgs.push('--new-window', url);
    }

    handleUpdateAction(index, {
      args: newArgs,
    });
  };

  const handleAddManualAction = () => {
    const newAct: Action = {
      type: 'launch',
      executable: 'notepad.exe',
      title: 'New Application',
      is_chrome_app: false,
      args: [],
      placement: {
        x: 150,
        y: 150,
        width: 900,
        height: 700,
        screen: 1,
        maximized: false,
      },
    };
    setActions((prev) => [...prev, newAct]);
    setExpandedIndex(actions.length);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      const presetId =
        initialPreset?.id ||
        name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString().slice(-4);

      const newPreset: Preset = {
        id: presetId,
        name: name.trim(),
        shortcut: shortcut.trim(),
        actions,
      };

      await onSave(newPreset);
    } catch (err) {
      console.error('Failed to save preset:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const getAppIcon = (act: Action) => {
    const exe = act.executable.toLowerCase();
    if (exe.includes('chrome') || act.is_chrome_app) {
      return <Globe className="w-5 h-5 text-cyan-400 shrink-0" />;
    }
    if (exe.includes('cmd') || exe.includes('powershell') || exe.includes('wt')) {
      return <Terminal className="w-5 h-5 text-emerald-400 shrink-0" />;
    }
    if (exe.includes('notepad') || exe.includes('code')) {
      return <FileText className="w-5 h-5 text-amber-400 shrink-0" />;
    }
    return <Layers className="w-5 h-5 text-indigo-400 shrink-0" />;
  };

  const screen1Actions = actions
    .map((act, index) => ({ act, index }))
    .filter(({ act }) => (act.placement?.screen || 1) === 1);

  const screen2Actions = actions
    .map((act, index) => ({ act, index }))
    .filter(({ act }) => (act.placement?.screen || 1) >= 2);

  const renderActionCard = (act: Action, index: number) => {
    const isExpanded = expandedIndex === index;
    const placement = act.placement || {
      x: 100,
      y: 100,
      width: 1000,
      height: 700,
      screen: 1,
      maximized: false,
    };

    const isChrome = act.is_chrome_app || act.executable.toLowerCase().includes('chrome');

    let currentUrl = '';
    let currentProfile = '';
    for (const arg of act.args) {
      if (arg.startsWith('--app=')) {
        currentUrl = arg.substring(6).replace(/^["']|["']$/g, '');
      } else if (arg.startsWith('http://') || arg.startsWith('https://')) {
        currentUrl = arg.replace(/^["']|["']$/g, '');
      } else if (arg.startsWith('--profile-directory=')) {
        currentProfile = arg.substring(20).replace(/^["']|["']$/g, '');
      }
    }

    return (
      <div
        key={index}
        className="bg-[#181824] border border-slate-800 rounded-xl overflow-hidden shadow-sm transition"
      >
        <div className="flex items-center justify-between p-3.5 hover:bg-slate-800/30 transition">
          <div
            className="flex items-center space-x-3 min-w-0 flex-1 cursor-pointer"
            onClick={() => toggleExpand(index)}
          >
            {getAppIcon(act)}
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-semibold text-slate-100 truncate">
                  {act.title || act.executable}
                </span>
                {act.is_chrome_app ? (
                  <span className="text-[10px] font-mono bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                    Chrome Web App
                  </span>
                ) : isChrome ? (
                  <span className="text-[10px] font-mono bg-slate-700/40 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full">
                    Chrome Browser
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                {act.executable}{' '}
                {act.args.length > 0 && `(${act.args.join(' ')})`}
              </p>
              {isChrome && (
                <div
                  className="mt-2 flex items-center space-x-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[10px] font-bold text-cyan-400 font-mono shrink-0">
                    URL:
                  </span>
                  <input
                    type="text"
                    value={currentUrl}
                    onChange={(e) => handleUrlChange(index, e.target.value)}
                    placeholder="https://calendar.google.com/calendar/u/1/r?tab=mc"
                    className="bg-slate-900/90 border border-slate-700/80 hover:border-cyan-500/60 focus:border-cyan-400 rounded px-2.5 py-1 text-slate-100 text-[11px] font-mono focus:outline-none w-full max-w-lg transition"
                  />
                  {currentProfile && (
                    <span className="text-[10px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded shrink-0">
                      Profile: {currentProfile}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0 pl-3">
            <button
              onClick={() => handleRemoveAction(index)}
              className="px-2.5 py-1 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg border border-rose-500/20 transition flex items-center space-x-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Remove</span>
            </button>
            <button
              onClick={() => toggleExpand(index)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Per-Application Switch-Away Action Selector */}
        <div className="flex flex-wrap items-center justify-between px-3.5 py-2.5 border-t border-slate-800/60 bg-slate-950/40 gap-2">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-semibold text-slate-300">
              When changing session:
            </span>
          </div>

          <div className="flex items-center space-x-1.5 flex-wrap gap-1">
            {[
              { id: 'nothing', label: 'Nothing', badge: 'Default', desc: 'Leave window open' },
              { id: 'minimize', label: 'Minimise', badge: 'Taskbar', desc: 'Minimise to taskbar' },
              { id: 'temp_minimize', label: 'Temp Minimise', badge: 'Smart Recall', desc: 'Minimise, restored when returning to General' },
              { id: 'kill', label: 'Kill', badge: 'Close', desc: 'Close / terminate window' },
            ].map((opt) => {
              const isSelected = (act.on_switch_away || 'nothing') === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUpdateAction(index, { on_switch_away: opt.id as SwitchAwayAction });
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer border flex items-center space-x-1.5 ${
                    isSelected
                      ? opt.id === 'kill'
                        ? 'bg-rose-500/25 text-rose-200 border-rose-500/80 shadow-sm shadow-rose-950/40 ring-1 ring-rose-500/40'
                        : opt.id === 'temp_minimize'
                        ? 'bg-cyan-500/25 text-cyan-200 border-cyan-500/80 shadow-sm shadow-cyan-950/40 ring-1 ring-cyan-500/40'
                        : opt.id === 'minimize'
                        ? 'bg-amber-500/25 text-amber-200 border-amber-500/80 shadow-sm shadow-amber-950/40 ring-1 ring-amber-500/40'
                        : 'bg-slate-700/60 text-white border-slate-400 shadow-sm shadow-black/40 ring-1 ring-slate-400/40'
                      : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                  }`}
                  title={opt.desc}
                >
                  <span>[{opt.label}]</span>
                  {isSelected && (
                    <span className="text-[9px] font-mono px-1 rounded bg-white/20 text-white font-normal">
                      {opt.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {isExpanded && (
          <div className="p-4 border-t border-slate-800 bg-slate-900/50 space-y-4 text-xs animate-in fade-in duration-150">
            {isChrome && (
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center space-x-2.5 cursor-pointer font-medium text-slate-200">
                    <input
                      type="checkbox"
                      checked={!!act.is_chrome_app}
                      onChange={(e) => handleChromeAppToggle(index, e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 w-4 h-4"
                    />
                    <span>Launch as isolated Chrome Application (App Mode)</span>
                  </label>

                  {chromeProfiles.length > 0 && (
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-semibold text-slate-400">Chrome Profile:</span>
                      <select
                        value={currentProfile}
                        onChange={(e) => handleChromeProfileChange(index, e.target.value)}
                        className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-slate-100 text-xs focus:outline-none focus:border-cyan-500 font-mono"
                      >
                        <option value="">Default Profile</option>
                        {chromeProfiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.user_name ? `(${p.user_name})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="pt-1 space-y-1">
                  <label className="block text-[11px] text-slate-400 font-mono">
                    Web Application / Page URL:
                  </label>
                  <input
                    type="text"
                    value={currentUrl}
                    onChange={(e) => handleUrlChange(index, e.target.value)}
                    placeholder="https://calendar.google.com/calendar/u/1/r?tab=mc"
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-slate-100 text-xs font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-[10px] text-slate-500">
                    {act.is_chrome_app ? (
                      <>
                        Will open as an isolated window: <span className="font-mono text-cyan-300">--app=&quot;{currentUrl || '&lt;URL&gt;'}&quot; --new-window</span>
                      </>
                    ) : (
                      <>
                        Will open as a standard browser window: <span className="font-mono text-cyan-300">--new-window &quot;{currentUrl || '&lt;URL&gt;'}&quot;</span>
                      </>
                    )}
                    {currentProfile && (
                      <span className="ml-2 text-indigo-400 font-mono">--profile-directory=&quot;{currentProfile}&quot;</span>
                    )}
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                CLI arguments
              </label>
              <input
                type="text"
                value={act.args.join(' ')}
                onChange={(e) => {
                  const newArgs = e.target.value.trim() ? e.target.value.split(' ') : [];
                  handleUpdateAction(index, { args: newArgs });
                }}
                placeholder="e.g. --new-window"
                className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-center pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Target Screen
                </label>
                <select
                  value={placement.screen || 1}
                  onChange={(e) =>
                    handleUpdatePlacement(index, { screen: parseInt(e.target.value, 10) })
                  }
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
                >
                  {monitors.map((m) => (
                    <option key={m.index} value={m.index}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Window Position
                </label>
                <select
                  value={placement.maximized ? 'maximized' : 'normal'}
                  onChange={(e) =>
                    handleUpdatePlacement(index, {
                      maximized: e.target.value === 'maximized',
                    })
                  }
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="normal">Normal</option>
                  <option value="maximized">Maximized</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Left (X)
                </label>
                <input
                  type="number"
                  value={placement.x}
                  onChange={(e) =>
                    handleUpdatePlacement(index, { x: parseInt(e.target.value, 10) || 0 })
                  }
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Top (Y)
                </label>
                <input
                  type="number"
                  value={placement.y}
                  onChange={(e) =>
                    handleUpdatePlacement(index, { y: parseInt(e.target.value, 10) || 0 })
                  }
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Width
                </label>
                <input
                  type="number"
                  value={placement.width}
                  onChange={(e) =>
                    handleUpdatePlacement(index, { width: parseInt(e.target.value, 10) || 100 })
                  }
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Height
                </label>
                <input
                  type="number"
                  value={placement.height}
                  onChange={(e) =>
                    handleUpdatePlacement(index, { height: parseInt(e.target.value, 10) || 100 })
                  }
                  className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-5xl h-[88vh] bg-[#12121c] border border-slate-700/80 rounded-2xl shadow-2xl shadow-black overflow-hidden flex flex-col text-slate-100 backdrop-blur-3xl animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/60">
        <div className="flex items-center space-x-3">
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center space-x-2 text-sm font-semibold tracking-wide">
            <span className="text-slate-400">Workspaces</span>
            <span className="text-slate-600">›</span>
            <span className="text-slate-100">
              {initialPreset ? 'Edit Workspace' : 'Create Workspace'}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition border border-slate-700/60"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || actions.length === 0}
            className="flex items-center space-x-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition shadow-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Visual Screens Diagram */}
        <div className="bg-[#181824] border border-slate-800/90 rounded-xl p-5 flex flex-col items-center">
          <div className="flex items-center space-x-4 w-full max-w-3xl justify-center">
            {monitors.map((m) => {
              const screenApps = actions.filter(
                (a) => (a.placement?.screen || 1) === m.index
              );
              return (
                <div
                  key={m.index}
                  className="flex-1 min-h-[140px] bg-[#222230] border-2 border-dashed border-slate-700/80 rounded-xl p-3 flex flex-col justify-between relative shadow-inner"
                >
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
                    <span className="flex items-center gap-1 font-semibold text-slate-300">
                      <Monitor className="w-3.5 h-3.5 text-indigo-400" />
                      {m.name} {m.is_primary && '(Primary)'}
                    </span>
                    <span>
                      {m.width}x{m.height}
                    </span>
                  </div>

                  <div className="flex-1 flex flex-wrap items-center justify-center gap-2.5 p-2">
                    {screenApps.length === 0 ? (
                      <span className="text-[11px] text-slate-500 italic">No apps assigned</span>
                    ) : (
                      screenApps.map((act, i) => (
                        <div
                          key={i}
                          className="flex items-center space-x-1.5 bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-700/60 shadow-sm"
                          title={act.title || act.executable}
                        >
                          {getAppIcon(act)}
                          <span className="text-xs font-medium text-slate-200 truncate max-w-[100px]">
                            {act.title || act.executable}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Workspace Form Options */}
        <div className="flex items-center justify-between gap-6 bg-slate-900/40 p-4 rounded-xl border border-slate-800/60">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Workspace name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Daily Dev, Calendar & Notes..."
              className="w-full bg-slate-950/80 border border-slate-700/70 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-medium"
            />
          </div>

          <div className="w-32">
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Quick Shortcut
            </label>
            <select
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-700/70 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={`${n}`}>
                  Key {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-6 pt-5">
            <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={createDesktopShortcut}
                onChange={(e) => setCreateDesktopShortcut(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
              />
              <span>Create desktop shortcut</span>
            </label>

            <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={moveExistingWindows}
                onChange={(e) => setMoveExistingWindows(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0"
              />
              <span>Move existing windows</span>
            </label>
          </div>
        </div>

        {/* Section: Screen 1 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5 text-indigo-400" />
              Screen 1
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              {screen1Actions.length} applications
            </span>
          </div>

          {screen1Actions.length === 0 ? (
            <div className="p-4 bg-slate-900/30 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
              No applications assigned to Screen 1.
            </div>
          ) : (
            screen1Actions.map(({ act, index }) => renderActionCard(act, index))
          )}
        </div>

        {/* Section: Screen 2 */}
        {monitors.length > 1 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5 text-indigo-400" />
                Screen 2
              </h3>
              <span className="text-xs text-slate-500 font-mono">
                {screen2Actions.length} applications
              </span>
            </div>

            {screen2Actions.length === 0 ? (
              <div className="p-4 bg-slate-900/30 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
                No applications assigned to Screen 2.
              </div>
            ) : (
              screen2Actions.map(({ act, index }) => renderActionCard(act, index))
            )}
          </div>
        )}

        {/* Add Manual App Button */}
        <div className="pt-2">
          <button
            onClick={handleAddManualAction}
            className="w-full py-2.5 border border-dashed border-slate-700/80 hover:border-indigo-500/80 rounded-xl text-xs font-medium text-slate-400 hover:text-indigo-300 flex items-center justify-center space-x-2 transition bg-slate-900/20 hover:bg-indigo-500/5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Application Manually</span>
          </button>
        </div>
      </div>
    </div>
  );
}
