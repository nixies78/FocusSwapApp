import { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Sparkles,
  Key,
  Webhook,
  FileText,
  Copy,
  Check,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Save,
} from 'lucide-react';
import { DocLink, DocLinkSettings, DocLinkConfig } from '../types';
import {
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  testWebhook,
  testOpenRouter,
} from '../utils/docSync';

interface DocLinksAdminModalProps {
  isOpen: boolean;
  initialTab?: 'links' | 'ai' | 'webhook';
  config: DocLinkConfig;
  onSaveConfig: (updatedConfig: DocLinkConfig) => Promise<void>;
  onClose: () => void;
}

export default function DocLinksAdminModal({
  isOpen,
  initialTab = 'links',
  config,
  onSaveConfig,
  onClose,
}: DocLinksAdminModalProps) {
  const [activeTab, setActiveTab] = useState<'links' | 'ai' | 'webhook'>(initialTab);

  // Doc Links state
  const [links, setLinks] = useState<DocLink[]>(config.links || []);
  const [editingLink, setEditingLink] = useState<DocLink | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDocUrl, setFormDocUrl] = useState('');
  const [formCustomPrompt, setFormCustomPrompt] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Settings state
  const [apiKey, setApiKey] = useState(config.settings.openrouter_api_key || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [model, setModel] = useState(
    config.settings.openrouter_model || 'deepseek/deepseek-chat'
  );
  const [isCustomModel, setIsCustomModel] = useState(
    ![
      'deepseek/deepseek-chat',
      'deepseek/deepseek-r1',
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4o-mini',
      'google/gemini-2.5-flash',
    ].includes(config.settings.openrouter_model || 'deepseek/deepseek-chat')
  );
  const [customModelInput, setCustomModelInput] = useState(
    config.settings.openrouter_model || ''
  );
  const [webhookUrl, setWebhookUrl] = useState(config.settings.webhook_url || '');
  const [customSystemPrompt, setCustomSystemPrompt] = useState(
    config.settings.custom_system_prompt || ''
  );

  // Testing state
  const [testApiStatus, setTestApiStatus] = useState<{
    loading: boolean;
    success?: boolean;
    message?: string;
  }>({ loading: false });
  const [testWebhookStatus, setTestWebhookStatus] = useState<{
    loading: boolean;
    success?: boolean;
    message?: string;
  }>({ loading: false });
  const [hasCopiedScript, setHasCopiedScript] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setLinks(config.links || []);
    setApiKey(config.settings.openrouter_api_key || '');
    setModel(config.settings.openrouter_model || 'deepseek/deepseek-chat');
    setWebhookUrl(config.settings.webhook_url || '');
    setCustomSystemPrompt(config.settings.custom_system_prompt || '');
  }, [config]);

  if (!isOpen) return null;

  const handleStartEdit = (link: DocLink) => {
    setEditingLink(link);
    setFormTitle(link.title);
    setFormDocUrl(link.doc_url);
    setFormCustomPrompt(link.custom_prompt || '');
    setIsAddingNew(false);
  };

  const handleStartAdd = () => {
    setEditingLink(null);
    setFormTitle('');
    setFormDocUrl('');
    setFormCustomPrompt('');
    setIsAddingNew(true);
  };

  const handleSaveLinkForm = () => {
    if (!formTitle.trim() || !formDocUrl.trim()) return;

    let updatedList: DocLink[];
    if (editingLink) {
      updatedList = links.map((l) =>
        l.id === editingLink.id
          ? {
              ...l,
              title: formTitle.trim(),
              doc_url: formDocUrl.trim(),
              custom_prompt: formCustomPrompt.trim() || undefined,
            }
          : l
      );
    } else {
      const newLink: DocLink = {
        id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: formTitle.trim(),
        doc_url: formDocUrl.trim(),
        custom_prompt: formCustomPrompt.trim() || undefined,
        order: links.length,
      };
      updatedList = [...links, newLink];
    }

    setLinks(updatedList);
    setEditingLink(null);
    setIsAddingNew(false);
    saveFullConfig(updatedList);
  };

  const handleDeleteLink = (id: string) => {
    const updatedList = links.filter((l) => l.id !== id);
    setLinks(updatedList);
    if (editingLink?.id === id) {
      setEditingLink(null);
      setIsAddingNew(false);
    }
    saveFullConfig(updatedList);
  };

  const saveFullConfig = async (currentLinks = links) => {
    setIsSaving(true);
    const chosenModel = isCustomModel ? customModelInput.trim() : model;
    const newSettings: DocLinkSettings = {
      openrouter_api_key: apiKey.trim(),
      openrouter_model: chosenModel || 'deepseek/deepseek-chat',
      webhook_url: webhookUrl.trim(),
      custom_system_prompt: customSystemPrompt.trim() || undefined,
    };

    const newConfig: DocLinkConfig = {
      links: currentLinks,
      settings: newSettings,
    };

    try {
      await onSaveConfig(newConfig);
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestApiKey = async () => {
    setTestApiStatus({ loading: true });
    const chosenModel = isCustomModel ? customModelInput.trim() : model;
    const res = await testOpenRouter(apiKey, chosenModel);
    setTestApiStatus({ loading: false, success: res.success, message: res.message });
  };

  const handleTestWebhook = async () => {
    setTestWebhookStatus({ loading: true });
    const res = await testWebhook(webhookUrl);
    setTestWebhookStatus({ loading: false, success: res.success, message: res.message });
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
    setHasCopiedScript(true);
    setTimeout(() => setHasCopiedScript(false), 2500);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xl animate-in fade-in duration-150 select-none cursor-default"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl bg-[#0c101a] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 max-h-[85vh] animate-in zoom-in-95 duration-150"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-300">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Document Sync & AI Setup
              </h3>
              <p className="text-[11px] text-slate-400">
                Keep Gemini notebook source documents updated in seconds
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 border-b border-slate-800/80 bg-slate-950/40 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('links')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-semibold transition cursor-pointer ${
              activeTab === 'links'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText size={14} />
            <span>Document Links ({links.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-semibold transition cursor-pointer ${
              activeTab === 'ai'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key size={14} />
            <span>OpenRouter & DeepSeek AI</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('webhook')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 text-xs font-semibold transition cursor-pointer ${
              activeTab === 'webhook'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Webhook size={14} />
            <span>Google Webhook Setup</span>
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* TAB 1: DOCUMENT LINKS */}
          {activeTab === 'links' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">Configured Document Links</h4>
                  <p className="text-xs text-slate-400">
                    These appear in the top-left corner of FocusDeck for one-click updating.
                  </p>
                </div>
                {!isAddingNew && !editingLink && (
                  <button
                    type="button"
                    onClick={handleStartAdd}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Add New Document</span>
                  </button>
                )}
              </div>

              {/* Add / Edit Form */}
              {(isAddingNew || editingLink) && (
                <div className="p-4 bg-slate-900/80 border border-indigo-500/40 rounded-xl space-y-3.5 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-300">
                      {editingLink ? 'Edit Document Link' : 'Add New Document Link'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingNew(false);
                        setEditingLink(null);
                      }}
                      className="text-slate-400 hover:text-white p-1 rounded"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300">
                        Title / Name *
                      </label>
                      <input
                        type="text"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        placeholder="e.g. Work Project Alpha or Personal Notes"
                        className="w-full px-3 py-2 bg-slate-950/80 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-300">
                        Google Doc URL or ID *
                      </label>
                      <input
                        type="text"
                        value={formDocUrl}
                        onChange={(e) => setFormDocUrl(e.target.value)}
                        placeholder="https://docs.google.com/document/d/.../edit"
                        className="w-full px-3 py-2 bg-slate-950/80 border border-slate-700 rounded-lg text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-300">
                      Custom Instructions for this doc (Optional)
                    </label>
                    <input
                      type="text"
                      value={formCustomPrompt}
                      onChange={(e) => setFormCustomPrompt(e.target.value)}
                      placeholder="e.g. Always keep bullet points concise, highlight deliverables and dates"
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingNew(false);
                        setEditingLink(null);
                      }}
                      className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveLinkForm}
                      disabled={!formTitle.trim() || !formDocUrl.trim()}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                    >
                      Save Document Link
                    </button>
                  </div>
                </div>
              )}

              {/* Links List */}
              {links.length === 0 && !isAddingNew ? (
                <div className="py-12 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center p-6 space-y-2 text-slate-500">
                  <FileText size={28} className="text-slate-600 mb-1" />
                  <p className="text-xs font-medium text-slate-400">No document links created yet</p>
                  <p className="text-[11px] text-slate-500 max-w-sm">
                    Add links to the Google Docs you reference inside Gemini notebooks (like project
                    notes or personal knowledge bases).
                  </p>
                  <button
                    type="button"
                    onClick={handleStartAdd}
                    className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 underline font-semibold"
                  >
                    Add your first Document Link
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {links.map((l) => (
                    <div
                      key={l.id}
                      className="p-3.5 bg-slate-900/50 hover:bg-slate-900/80 border border-slate-800 rounded-xl flex items-center justify-between transition"
                    >
                      <div className="flex items-center space-x-3 overflow-hidden pr-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                          <FileText size={15} />
                        </div>
                        <div className="overflow-hidden">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white truncate">{l.title}</span>
                            {l.last_updated && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                Updated {new Date(l.last_updated).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono truncate block max-w-md">
                            {l.doc_url}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(l)}
                          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLink(l.id)}
                          className="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: OPENROUTER AI */}
          {activeTab === 'ai' && (
            <div className="space-y-5">
              <div>
                <h4 className="text-sm font-bold text-white">OpenRouter AI Configuration</h4>
                <p className="text-xs text-slate-400">
                  FocusDeck uses OpenRouter to intelligently synthesize your updates using models
                  like DeepSeek.
                </p>
              </div>

              {/* API Key */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>OpenRouter API Key</span>
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1"
                  >
                    <span>Get Key</span>
                    <ExternalLink size={10} />
                  </a>
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-or-v1-..."
                    className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                  >
                    {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Model Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Default Model</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomModel(false);
                      setModel('deepseek/deepseek-chat');
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      !isCustomModel && model === 'deepseek/deepseek-chat'
                        ? 'bg-indigo-600/20 border-indigo-500 text-white'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-semibold text-xs text-white">DeepSeek V3 (Chat)</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Recommended: High quality, fast, cost-effective
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomModel(false);
                      setModel('deepseek/deepseek-r1');
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      !isCustomModel && model === 'deepseek/deepseek-r1'
                        ? 'bg-indigo-600/20 border-indigo-500 text-white'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-semibold text-xs text-white">DeepSeek R1 (Reasoner)</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Deep reasoning for complex knowledge integration
                    </div>
                  </button>
                </div>

                <div className="pt-1">
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Or select another model:
                  </label>
                  <select
                    value={isCustomModel ? 'custom' : model}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setIsCustomModel(true);
                      } else {
                        setIsCustomModel(false);
                        setModel(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                  >
                    <option value="deepseek/deepseek-chat">deepseek/deepseek-chat (DeepSeek V3)</option>
                    <option value="deepseek/deepseek-r1">deepseek/deepseek-r1 (DeepSeek R1)</option>
                    <option value="anthropic/claude-3.5-sonnet">anthropic/claude-3.5-sonnet</option>
                    <option value="openai/gpt-4o-mini">openai/gpt-4o-mini</option>
                    <option value="google/gemini-2.5-flash">google/gemini-2.5-flash</option>
                    <option value="custom">Custom Model Slug...</option>
                  </select>
                </div>

                {isCustomModel && (
                  <div className="pt-1">
                    <input
                      type="text"
                      value={customModelInput}
                      onChange={(e) => setCustomModelInput(e.target.value)}
                      placeholder="e.g. meta-llama/llama-3.3-70b-instruct"
                      className="w-full px-3 py-2 bg-slate-950/80 border border-slate-700 rounded-xl text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}
              </div>

              {/* Test Button & Status */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleTestApiKey}
                  disabled={testApiStatus.loading || !apiKey.trim()}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition cursor-pointer"
                >
                  {testApiStatus.loading ? 'Testing...' : 'Test OpenRouter Connection'}
                </button>

                {testApiStatus.message && (
                  <div
                    className={`text-xs flex items-center gap-1.5 ${
                      testApiStatus.success ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {testApiStatus.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    <span>{testApiStatus.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: GOOGLE WEBHOOK SETUP */}
          {activeTab === 'webhook' && (
            <div className="space-y-5">
              <div>
                <h4 className="text-sm font-bold text-white">Google Apps Script Webhook</h4>
                <p className="text-xs text-slate-400">
                  Connect FocusDeck to your Google Account without complex Google Cloud OAuth
                  screens or expiring test tokens.
                </p>
              </div>

              {/* Webhook URL Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Google Apps Script Web App URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="flex-1 px-3.5 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    disabled={testWebhookStatus.loading || !webhookUrl.trim()}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition cursor-pointer whitespace-nowrap"
                  >
                    {testWebhookStatus.loading ? 'Testing...' : 'Test Webhook'}
                  </button>
                </div>
                {testWebhookStatus.message && (
                  <div
                    className={`text-xs flex items-center gap-1.5 pt-1 ${
                      testWebhookStatus.success ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {testWebhookStatus.success ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <AlertCircle size={14} />
                    )}
                    <span>{testWebhookStatus.message}</span>
                  </div>
                )}
              </div>

              {/* Setup Instructions Card */}
              <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">
                      1
                    </span>
                    <span className="text-xs font-bold text-white">
                      1-Minute Google Apps Script Setup
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyScript}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer"
                  >
                    {hasCopiedScript ? <Check size={14} /> : <Copy size={14} />}
                    <span>{hasCopiedScript ? 'Copied to Clipboard!' : 'Copy Script Code'}</span>
                  </button>
                </div>

                <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside pl-1">
                  <li>
                    Open{' '}
                    <a
                      href="https://script.google.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-400 hover:underline font-mono inline-flex items-center gap-0.5"
                    >
                      script.google.com <ExternalLink size={10} />
                    </a>{' '}
                    and click <strong>New project</strong>.
                  </li>
                  <li>
                    Replace the code in <strong>Code.gs</strong> by pasting the copied script above.
                  </li>
                  <li>
                    Click <strong>Deploy &gt; New deployment</strong>. Click the gear icon next to
                    "Select type" and choose <strong>Web app</strong>.
                    <div className="mt-1 ml-5 text-[11px] text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                      • <strong>Execute as:</strong> Me (your Google account)
                      <br />• <strong>Who has access:</strong> Anyone
                    </div>
                  </li>
                  <li>
                    Click <strong>Deploy</strong>, grant Google access permissions, and copy the{' '}
                    <strong>Web app URL</strong> into the field above!
                  </li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/60">
          <span className="text-xs text-slate-500 font-mono">
            FocusDeck • Gemini Notebook Knowledge Bridge
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                saveFullConfig();
                onClose();
              }}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition cursor-pointer"
            >
              <Save size={14} />
              <span>{isSaving ? 'Saving...' : 'Save & Close'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
