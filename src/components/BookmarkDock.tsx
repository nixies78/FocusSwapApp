import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings, Sparkles } from 'lucide-react';
import { Bookmark, BookmarkCategory, BookmarkConfig, SvgIconEntry } from '../types';
import { getSvgMarkup } from '../utils/svgLibrary';
import BookmarkAdminModal from './BookmarkAdminModal';

interface BookmarkDockProps {
  onCloseOverlay: () => void;
}

export default function BookmarkDock({ onCloseOverlay }: BookmarkDockProps) {
  const [categories, setCategories] = useState<BookmarkCategory[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [customSvgs, setCustomSvgs] = useState<SvgIconEntry[]>([]);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  const loadBookmarks = useCallback(async () => {
    try {
      const cfg = await invoke<BookmarkConfig>('get_bookmarks');
      setCategories(cfg.categories || []);
      setBookmarks(cfg.bookmarks || []);
      setCustomSvgs(cfg.custom_svgs || []);
    } catch (err) {
      console.error('Failed to load bookmarks in dock:', err);
    }
  }, []);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const handleLaunch = async (bm: Bookmark) => {
    if (launchingId) return;
    setLaunchingId(bm.id);
    try {
      await invoke('execute_bookmark', { action: bm.action });
      onCloseOverlay();
    } catch (err) {
      console.error('Failed to execute bookmark:', err);
    } finally {
      setLaunchingId(null);
    }
  };

  // Sort categories by order
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  return (
    <>
      <aside
        aria-label="Bookmarks dock"
        className="fixed left-8 top-22 bottom-14 w-60 z-40 flex flex-col pointer-events-auto select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Main Dock Container */}
        <div className="flex-1 flex flex-col bg-[#0b0e17]/85 backdrop-blur-2xl border border-slate-800/90 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden text-slate-100">
          {/* Dock Header */}
          <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-800/80 bg-slate-900/50">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-sm shadow-cyan-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Bookmarks
              </h2>
            </div>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setIsAdminOpen(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
                title="Manage Categories & SVG Database"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Categories & Bookmark Boxes Scroll Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3.5 custom-scrollbar">
            {sortedCategories.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center text-slate-500">
                <Sparkles className="w-6 h-6 mb-2 text-indigo-400/60" />
                <p className="text-xs font-medium">No bookmark categories</p>
                <button
                  type="button"
                  onClick={() => setIsAdminOpen(true)}
                  className="mt-2 text-[11px] text-indigo-400 hover:text-indigo-300 underline"
                >
                  Create Category
                </button>
              </div>
            ) : (
              sortedCategories.map((cat) => {
                const catBms = bookmarks
                  .filter((b) => b.category_id === cat.id)
                  .sort((a, b) => a.order - b.order);

                return (
                  <div
                    key={cat.id}
                    className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-all duration-150"
                  >
                    {/* Category Title */}
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-300 font-mono">
                        {cat.name}
                      </span>
                      <span className="text-[9px] font-mono text-slate-500 bg-slate-800/60 px-1.5 py-0.5 rounded">
                        {catBms.length}
                      </span>
                    </div>

                    {/* Bookmarks SVG Grid */}
                    {catBms.length === 0 ? (
                      <div
                        onClick={() => setIsAdminOpen(true)}
                        className="py-3 px-2 border border-dashed border-slate-800 hover:border-slate-700 rounded-lg text-center cursor-pointer group transition"
                      >
                        <span className="text-[10px] text-slate-500 group-hover:text-slate-400">
                          + Right-click captured window to add
                        </span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2">
                        {catBms.map((bm) => {
                          const svgMarkup = getSvgMarkup(
                            bm.icon_id,
                            customSvgs.find((c) => c.id === bm.icon_id)?.svg
                          );

                          const targetDesc =
                            bm.action.args.join(' ') || bm.action.executable;

                          return (
                            <button
                              key={bm.id}
                              type="button"
                              onClick={() => handleLaunch(bm)}
                              disabled={launchingId === bm.id}
                              className={`group relative flex items-center justify-center w-12 h-12 rounded-xl bg-slate-800/40 hover:bg-indigo-600/30 border border-slate-700/60 hover:border-indigo-400/80 shadow-sm transition-all duration-150 active:scale-95 cursor-pointer ${
                                launchingId === bm.id ? 'opacity-50 animate-pulse' : ''
                              }`}
                              title={`${bm.name}\n${targetDesc}`}
                            >
                              <div
                                className="w-5 h-5 text-white group-hover:text-cyan-300 transition-colors flex items-center justify-center p-0.5"
                                dangerouslySetInnerHTML={{ __html: svgMarkup }}
                              />

                              {/* Hover Floating Tooltip */}
                              <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-[#0f121d] border border-slate-700/90 rounded-lg shadow-xl shadow-black/80 text-left pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 whitespace-nowrap hidden group-hover:block">
                                <span className="text-xs font-semibold text-white block">
                                  {bm.name}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono block max-w-xs truncate">
                                  {targetDesc}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Quick Footer hint */}
          <div className="p-2 border-t border-slate-800/80 bg-slate-900/40 text-center">
            <span className="text-[9px] text-slate-500 font-mono">
              1-Click Instant Trigger
            </span>
          </div>
        </div>
      </aside>

      {/* Admin Modal */}
      <BookmarkAdminModal
        isOpen={isAdminOpen}
        onClose={() => {
          setIsAdminOpen(false);
          loadBookmarks();
        }}
        onConfigUpdated={loadBookmarks}
      />
    </>
  );
}
