import { FileText, Plus, Sparkles, Settings2 } from 'lucide-react';
import { DocLink } from '../types';

interface DocLinksBarProps {
  links: DocLink[];
  onOpenDocModal: (link: DocLink) => void;
  onOpenAdmin: (tab?: 'links' | 'ai' | 'webhook') => void;
  isConfigured: boolean;
}

export default function DocLinksBar({
  links,
  onOpenDocModal,
  onOpenAdmin,
  isConfigured,
}: DocLinksBarProps) {
  const sortedLinks = [...links].sort((a, b) => a.order - b.order);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-[calc(100vw-420px)] py-1"
    >
      {/* Document Pills */}
      {sortedLinks.map((link) => (
        <button
          key={link.id}
          type="button"
          onClick={() => onOpenDocModal(link)}
          className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-900/90 hover:bg-slate-800/95 text-slate-200 hover:text-white rounded-xl border border-slate-700/70 shadow-2xl backdrop-blur-xl transition-all duration-150 hover:border-indigo-500/60 hover:shadow-indigo-500/20 active:scale-95 group font-medium text-xs cursor-pointer whitespace-nowrap shrink-0"
          title={`Click to update "${link.title}" with AI`}
        >
          <div className="w-5 h-5 rounded-md bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-300 group-hover:scale-105 group-hover:bg-indigo-500/30 transition-all">
            <FileText size={12} />
          </div>
          <span className="font-semibold text-slate-100 group-hover:text-white">
            {link.title}
          </span>
          <span className="text-[10px] text-indigo-400 font-mono tracking-tight opacity-75 group-hover:opacity-100 flex items-center">
            <Sparkles size={10} className="mr-0.5 inline" /> AI
          </span>
        </button>
      ))}

      {/* Add Document Link Button */}
      <button
        type="button"
        onClick={() => onOpenAdmin('links')}
        className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-900/70 hover:bg-slate-800/90 text-slate-400 hover:text-cyan-300 rounded-xl border border-dashed border-slate-700/80 hover:border-cyan-500/60 shadow-xl backdrop-blur-xl transition-all duration-150 active:scale-95 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 group"
        title="Add new Document Update link for Gemini notebook"
      >
        <Plus size={14} className="group-hover:rotate-90 transition-transform duration-200" />
        <span>{sortedLinks.length === 0 ? 'Add Doc Update Link' : 'Add Link'}</span>
      </button>

      {/* Doc AI Settings & Setup Button */}
      <button
        type="button"
        onClick={() => onOpenAdmin('ai')}
        className={`p-2.5 rounded-xl border shadow-xl backdrop-blur-xl transition-all duration-150 active:scale-95 cursor-pointer shrink-0 relative group ${
          !isConfigured
            ? 'bg-amber-950/40 border-amber-500/50 text-amber-300 hover:bg-amber-900/50 animate-pulse'
            : 'bg-slate-900/70 hover:bg-slate-800/90 border-slate-700/80 hover:border-indigo-500/60 text-slate-400 hover:text-white'
        }`}
        title={isConfigured ? 'Doc Update AI & Webhook Settings' : 'Configuration required: OpenRouter API Key & Webhook'}
      >
        <Settings2 size={16} className="group-hover:rotate-45 transition-transform duration-300" />
        {!isConfigured && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
        )}
      </button>
    </div>
  );
}
