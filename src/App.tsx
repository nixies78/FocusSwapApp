import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CapturedLayout, Preset } from './types';
import WorkspacesManager from './components/WorkspacesManager';
import WorkspaceEditor from './components/WorkspaceEditor';
import RadialMenu from './components/RadialMenu';

export default function App() {
  const [view, setView] = useState<'launcher' | 'manager' | 'editor'>('launcher');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null);
  const [capturedLayout, setCapturedLayout] = useState<CapturedLayout | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const fetchActiveSession = async () => {
    try {
      const active = await invoke<string | null>('get_active_session');
      setActiveSessionId(active || null);
    } catch (err) {
      console.error('Failed to load active session:', err);
    }
  };

  const fetchPresets = async () => {
    try {
      const data = await invoke<Preset[]>('get_presets');
      setPresets(data || []);
      await fetchActiveSession();
    } catch (err) {
      console.error('Failed to load presets:', err);
    }
  };

  useEffect(() => {
    fetchPresets();

    const handleFocus = () => {
      fetchPresets();
      if (view === 'launcher') {
        invoke('center_cursor').catch(() => {});
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [view]);

  const handleSwitchToGeneral = async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    try {
      await invoke('switch_to_general');
      setActiveSessionId(null);
      await invoke('hide_overlay');
    } catch (err) {
      console.error('Failed to switch to general:', err);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleExecute = async (preset: Preset) => {
    if (isExecuting) return;
    setIsExecuting(true);
    try {
      await invoke('execute_preset', { presetId: preset.id });
      setActiveSessionId(preset.id);
      await invoke('hide_overlay');
    } catch (err) {
      console.error('Failed to execute preset:', err);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleHide = async () => {
    try {
      await invoke('hide_overlay');
      setView('launcher');
    } catch (err) {
      console.error('Failed to hide overlay:', err);
    }
  };

  const handleSavePreset = async (preset: Preset) => {
    try {
      let updatedPresets: Preset[];
      const existingIdx = presets.findIndex((p) => p.id === preset.id);
      if (existingIdx >= 0) {
        updatedPresets = presets.map((p, i) => (i === existingIdx ? preset : p));
      } else {
        updatedPresets = [...presets, preset];
      }

      await invoke('save_presets', { presets: updatedPresets });
      setPresets(updatedPresets);
      setView('launcher');
    } catch (err) {
      console.error('Failed to save preset:', err);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    try {
      const remaining = await invoke<Preset[]>('delete_preset', { presetId });
      setPresets(remaining);
      if (activeSessionId === presetId) {
        setActiveSessionId(null);
      }
    } catch (err) {
      console.error('Failed to delete preset:', err);
    }
  };

  const handleCreateNew = (layout?: CapturedLayout) => {
    setCapturedLayout(layout || null);
    setEditingPreset(null);
    setView('editor');
  };

  const handleEdit = (preset: Preset) => {
    setEditingPreset(preset);
    setCapturedLayout(null);
    setView('editor');
  };

  if (view === 'launcher') {
    return (
      <RadialMenu
        presets={presets}
        activeSessionId={activeSessionId}
        onSelectPreset={handleExecute}
        onSelectGeneral={handleSwitchToGeneral}
        onOpenManager={() => setView('manager')}
        onClose={handleHide}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 w-screen h-screen flex flex-col items-center justify-center p-6 bg-[#0a0a0f]/85 backdrop-blur-2xl transition-all duration-200 select-none cursor-default"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleHide();
        }
      }}
    >
      {view === 'manager' ? (
        <WorkspacesManager
          presets={presets}
          onLaunch={handleExecute}
          onSwitchToGeneral={handleSwitchToGeneral}
          onEdit={handleEdit}
          onCreateNew={handleCreateNew}
          onDelete={handleDeletePreset}
          onBackToLauncher={() => setView('launcher')}
        />
      ) : (
        <WorkspaceEditor
          initialPreset={editingPreset}
          capturedLayout={capturedLayout}
          allPresets={presets}
          onSave={handleSavePreset}
          onCancel={() => setView('manager')}
        />
      )}
    </div>
  );
}
