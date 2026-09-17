import { useState } from 'react';
import { Layers, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { CapturedLayout } from '../types';

interface SnapshotCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptured: (layout: CapturedLayout) => void;
}

export default function SnapshotCreatorModal({
  isOpen,
  onClose,
  onCaptured,
}: SnapshotCreatorModalProps) {
  const [isCapturing, setIsCapturing] = useState(false);

  if (!isOpen) return null;

  const handleCapture = async () => {
    try {
      setIsCapturing(true);
      const layout = await invoke<CapturedLayout>('capture_window_layout');
      onCaptured(layout);
    } catch (err) {
      console.error('Failed to capture layout:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-[420px] bg-[#1a1a24] border border-slate-700/80 rounded-2xl shadow-2xl shadow-black overflow-hidden flex flex-col text-slate-100">
        {/* Title bar */}
        <div className="flex items-center space-x-2.5 px-5 py-3.5 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-center w-6 h-6 rounded bg-indigo-500/20 text-indigo-400">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-sm font-semibold tracking-wide text-slate-200">
            Snapshot Creator
          </h2>
        </div>

        {/* Content */}
        <div className="p-6 text-center">
          <p className="text-sm text-slate-300 font-medium">
            Edit your layout and click &quot;Capture&quot; when finished.
          </p>
          <p className="text-xs text-slate-500 mt-2">
            FocusDeck will snapshot the positions and displays of all your open application windows.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-center space-x-3 px-6 pb-6">
          <button
            onClick={handleCapture}
            disabled={isCapturing}
            className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition shadow-sm disabled:opacity-50"
          >
            {isCapturing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Capturing...
              </>
            ) : (
              'Capture'
            )}
          </button>
          <button
            onClick={onClose}
            disabled={isCapturing}
            className="flex-1 px-4 py-2 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 rounded-lg text-sm font-medium transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
