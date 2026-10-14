import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  X,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileText,
  Settings,
  GitMerge,
  ListPlus,
} from 'lucide-react';
import { DocLink, DocLinkSettings } from '../types';
import { readGoogleDoc, updateGoogleDoc, generateDocUpdate } from '../utils/docSync';

interface DocQuickUpdateModalProps {
  doc: DocLink | null;
  settings: DocLinkSettings;
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: (tab: 'links' | 'ai' | 'webhook') => void;
  onDocUpdated: (docId: string) => void;
}

export default function DocQuickUpdateModal({
  doc,
  settings,
  isOpen,
  onClose,
  onOpenSettings,
  onDocUpdated,
}: DocQuickUpdateModalProps) {
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState<'merge' | 'append'>('merge');
  const [selectedModel, setSelectedModel] = useState(
    settings.openrouter_model || 'deepseek/deepseek-chat'
  );
  const [status, setStatus] = useState<
    'idle' | 'reading' | 'synthesizing' | 'saving' | 'success' | 'error'
  >('idle');
  const [statusText, setStatusText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState(doc?.title || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (doc) {
      setDocTitle(doc.title);
      setSelectedModel(settings.openrouter_model || 'deepseek/deepseek-chat');
      setNotes('');
      setStatus('idle');
      setErrorMessage(null);
    }
  }, [doc, settings]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen || !doc) return null;

  const isConfigured =
    Boolean(settings.openrouter_api_key?.trim()) && Boolean(settings.webhook_url?.trim());

  const handleOpenDocInBrowser = () => {
    if (doc.doc_url) {
      invoke('open_external_url', { url: doc.doc_url }).catch((err) => {
        console.error('Failed to open doc in browser:', err);
      });
    }
  };

  const handleSubmit = async () => {
    if (!notes.trim()) {
      setErrorMessage('Please paste or type the information to update.');
      return;
    }

    if (!settings.openrouter_api_key?.trim()) {
      setErrorMessage('OpenRouter API key is missing. Please configure it in Settings.');
      return;
    }

    if (!settings.webhook_url?.trim()) {
      setErrorMessage('Google Apps Script Webhook URL is missing. Please configure it in Settings.');
      return;
    }

    setErrorMessage(null);

    try {
      // Step 1: Read current document from Google Docs
      setStatus('reading');
      setStatusText('Fetching current document from Google Docs...');
      const readResult = await readGoogleDoc(settings.webhook_url, doc.doc_url);
      if (readResult.title) {
        setDocTitle(readResult.title);
      }

      // Step 2: Synthesize updates using OpenRouter (DeepSeek)
      setStatus('synthesizing');
      setStatusText(
        `Synthesizing update with ${selectedModel.includes('deepseek') ? 'DeepSeek' : selectedModel}...`
      );
      const updatedText = await generateDocUpdate(
        settings.openrouter_api_key,
        selectedModel,
        readResult.text,
        notes,
        mode,
        doc.custom_prompt,
        settings.custom_system_prompt
      );

      // Step 3: Write back to Google Docs
      setStatus('saving');
      setStatusText('Saving updated document to Google Docs...');
      await updateGoogleDoc(
        settings.webhook_url,
        doc.doc_url,
        updatedText,
        mode === 'merge' ? 'update' : 'append'
      );

      setStatus('success');
      setStatusText('Document updated successfully!');
      onDocUpdated(doc.id);
    } catch (err: any) {
      console.error('Doc update error:', err);
      setStatus('error');
      setErrorMessage(err.message || 'An error occurred while updating the document.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (status !== 'reading' && status !== 'synthesizing' && status !== 'saving') {
        handleSubmit();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-150 select-none cursor-default"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="w-full max-w-2xl bg-[#0d111c] border border-slate-700/80 rounded-2xl shadow-2xl shadow-indigo-950/40 overflow-hidden flex flex-col text-slate-100 animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shadow-sm">
              <FileText size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  {docTitle || doc.title}
                </h3>
                <button
                  type="button"
                  onClick={handleOpenDocInBrowser}
                  className="text-slate-400 hover:text-indigo-300 p-1 rounded-md hover:bg-slate-800/70 transition"
                  title="Open this Google Doc in default browser"
                >
                  <ExternalLink size={14} />
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Gemini Notebook Source Doc • Real-time AI Knowledge Sync
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenSettings('ai')}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              title="Settings (API Key & Webhook)"
            >
              <Settings size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Configuration Warning Banner */}
        {!isConfigured && (
          <div className="px-6 py-2.5 bg-amber-950/40 border-b border-amber-500/30 flex items-center justify-between text-amber-200 text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-400 shrink-0" />
              <span>Setup required: OpenRouter API key and Google Webhook must be configured.</span>
            </div>
            <button
              type="button"
              onClick={() => onOpenSettings('ai')}
              className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 rounded-md text-amber-100 text-[11px] font-semibold transition"
            >
              Configure Now
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {status === 'success' ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 animate-in zoom-in duration-200 shadow-lg shadow-emerald-500/20">
                <CheckCircle2 size={28} />
              </div>
              <h4 className="text-lg font-bold text-white">Google Doc Updated!</h4>
              <p className="text-xs text-slate-300 max-w-md">
                Your notes were synthesized by DeepSeek and saved directly into the Google Doc.
                Your Gemini notebook will now reference this updated content.
              </p>
              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={handleOpenDocInBrowser}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition cursor-pointer"
                >
                  <ExternalLink size={14} />
                  <span>View in Google Docs</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Textarea Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Information to update into document:</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Press Ctrl+Enter to submit
                  </span>
                </label>
                <textarea
                  ref={textareaRef}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={
                    status === 'reading' || status === 'synthesizing' || status === 'saving'
                  }
                  placeholder="Paste or type details here... e.g.:&#10;- Decision from 10am sync: Launching beta on Friday&#10;- Schema migration moved to 2 AM&#10;- New contact for client: Alex (alex@example.com)"
                  rows={6}
                  className="w-full px-3.5 py-3 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs font-sans resize-none transition"
                />
              </div>

              {/* Mode & Model Controls */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                {/* Integration Mode */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Update Mode</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950/60 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setMode('merge')}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                        mode === 'merge'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="AI intelligently blends updates into the best matching sections"
                    >
                      <GitMerge size={12} />
                      <span>Intelligent Merge</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('append')}
                      className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                        mode === 'append'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="AI appends a dated log entry to the document"
                    >
                      <ListPlus size={12} />
                      <span>Append Log</span>
                    </button>
                  </div>
                </div>

                {/* Model Selector */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">AI Model</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={
                      status === 'reading' || status === 'synthesizing' || status === 'saving'
                    }
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="deepseek/deepseek-chat">DeepSeek V3 (Recommended)</option>
                    <option value="deepseek/deepseek-r1">DeepSeek R1 (Deep Reasoning)</option>
                    <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                    <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                    <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
                    {![
                      'deepseek/deepseek-chat',
                      'deepseek/deepseek-r1',
                      'anthropic/claude-3.5-sonnet',
                      'openai/gpt-4o-mini',
                      'google/gemini-2.5-flash',
                    ].includes(selectedModel) && (
                      <option value={selectedModel}>{selectedModel}</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Status or Error Message */}
              {(status === 'reading' ||
                status === 'synthesizing' ||
                status === 'saving' ||
                errorMessage) && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                    errorMessage
                      ? 'bg-red-950/40 border-red-500/40 text-red-200'
                      : 'bg-indigo-950/40 border-indigo-500/40 text-indigo-200'
                  }`}
                >
                  {errorMessage ? (
                    <AlertTriangle size={16} className="text-red-400 shrink-0" />
                  ) : (
                    <Loader2 size={16} className="animate-spin text-indigo-400 shrink-0" />
                  )}
                  <span className="flex-1 font-medium">{errorMessage || statusText}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        {status !== 'success' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800/80 bg-slate-900/40">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <Sparkles size={13} className="text-indigo-400" />
              <span>Updates Google Docs directly via OpenRouter</span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                disabled={status === 'reading' || status === 'synthesizing' || status === 'saving'}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/80 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  status === 'reading' ||
                  status === 'synthesizing' ||
                  status === 'saving' ||
                  !notes.trim()
                }
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white shadow-lg shadow-indigo-600/30 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {status === 'reading' || status === 'synthesizing' || status === 'saving' ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} className="group-hover:rotate-12 transition-transform" />
                    <span>Update Document</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
