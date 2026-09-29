import { useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  X,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Pencil,
  Check,
  Search,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Bookmark, BookmarkCategory, BookmarkConfig, SvgIconEntry } from '../types';
import { BUILTIN_SVGS, getSvgMarkup } from '../utils/svgLibrary';

interface BookmarkAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated: () => void;
}

export default function BookmarkAdminModal({
  isOpen,
  onClose,
  onConfigUpdated,
}: BookmarkAdminModalProps) {
  const [activeTab, setActiveTab] = useState<'categories' | 'svgs'>('categories');
  const [categories, setCategories] = useState<BookmarkCategory[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [customSvgs, setCustomSvgs] = useState<SvgIconEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Category creation
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');

  // Bookmark editing
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [editBmName, setEditBmName] = useState('');
  const [editBmTarget, setEditBmTarget] = useState('');
  const [editBmIcon, setEditBmIcon] = useState('globe');

  // Custom SVG creation
  const [svgName, setSvgName] = useState('');
  const [svgMarkup, setSvgMarkup] = useState('');
  const [svgError, setSvgError] = useState<string | null>(null);
  const [searchSvg, setSearchSvg] = useState('');

  // Load config on open
  useMemo(() => {
    if (!isOpen) return;
    invoke<BookmarkConfig>('get_bookmarks')
      .then((cfg) => {
        setCategories(cfg.categories || []);
        setBookmarks(cfg.bookmarks || []);
        setCustomSvgs(cfg.custom_svgs || []);
      })
      .catch((err) => console.error('Failed to load bookmarks:', err));
  }, [isOpen]);

  const saveAll = async (
    newCats: BookmarkCategory[],
    newBms: Bookmark[],
    newSvgs: SvgIconEntry[]
  ) => {
    setIsSaving(true);
    try {
      const cfg: BookmarkConfig = {
        categories: newCats,
        bookmarks: newBms,
        custom_svgs: newSvgs,
      };
      await invoke('save_bookmarks', { bookmarks: cfg });
      setCategories(newCats);
      setBookmarks(newBms);
      setCustomSvgs(newSvgs);
      onConfigUpdated();
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setIsSaving(false);
    }
  };

  /* Category Operations */
  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    const id = newCatName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const updated: BookmarkCategory[] = [
      ...categories,
      { id, name: newCatName.trim(), order: categories.length },
    ];
    setNewCatName('');
    saveAll(updated, bookmarks, customSvgs);
  };

  const handleRenameCategory = (id: string) => {
    if (!editingCatName.trim()) return;
    const updated = categories.map((c) =>
      c.id === id ? { ...c, name: editingCatName.trim() } : c
    );
    setEditingCatId(null);
    saveAll(updated, bookmarks, customSvgs);
  };

  const handleDeleteCategory = (id: string) => {
    const updatedCats = categories.filter((c) => c.id !== id);
    const updatedBms = bookmarks.filter((b) => b.category_id !== id);
    saveAll(updatedCats, updatedBms, customSvgs);
  };

  const handleMoveCategory = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= categories.length) return;
    const copy = [...categories];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    copy.forEach((c, idx) => (c.order = idx));
    saveAll(copy, bookmarks, customSvgs);
  };

  /* Bookmark Operations */
  const handleDeleteBookmark = (bmId: string) => {
    const updated = bookmarks.filter((b) => b.id !== bmId);
    saveAll(categories, updated, customSvgs);
  };

  const handleMoveBookmark = (category_id: string, indexInCat: number, direction: 'up' | 'down') => {
    const catBookmarks = bookmarks.filter((b) => b.category_id === category_id);
    const targetIdx = direction === 'up' ? indexInCat - 1 : indexInCat + 1;
    if (targetIdx < 0 || targetIdx >= catBookmarks.length) return;

    const currentBm = catBookmarks[indexInCat];
    const targetBm = catBookmarks[targetIdx];

    const updated = bookmarks.map((b) => {
      if (b.id === currentBm.id) return { ...b, order: targetIdx };
      if (b.id === targetBm.id) return { ...b, order: indexInCat };
      return b;
    });

    saveAll(categories, updated, customSvgs);
  };

  const handleMoveToCategory = (bmId: string, newCatId: string) => {
    const updated = bookmarks.map((b) =>
      b.id === bmId ? { ...b, category_id: newCatId } : b
    );
    saveAll(categories, updated, customSvgs);
  };

  const handleStartEditBookmark = (bm: Bookmark) => {
    setEditingBookmark(bm);
    setEditBmName(bm.name);
    const target = bm.action.args.join(' ') || bm.action.executable;
    setEditBmTarget(target);
    setEditBmIcon(bm.icon_id || 'globe');
  };

  const handleSaveEditBookmark = () => {
    if (!editingBookmark) return;
    const updated = bookmarks.map((b) => {
      if (b.id !== editingBookmark.id) return b;
      const act = { ...b.action };
      if (act.args.length > 0) {
        act.args = [editBmTarget];
      } else {
        act.executable = editBmTarget;
      }
      return {
        ...b,
        name: editBmName.trim(),
        icon_id: editBmIcon,
        action: act,
      };
    });
    setEditingBookmark(null);
    saveAll(categories, updated, customSvgs);
  };

  /* SVG Library Operations */
  const handleAddSvg = () => {
    setSvgError(null);
    if (!svgName.trim()) {
      setSvgError('Please enter a name for the icon');
      return;
    }
    const cleanSvg = svgMarkup.trim();
    if (!cleanSvg.startsWith('<svg') || !cleanSvg.endsWith('</svg>')) {
      setSvgError('SVG must be valid markup starting with <svg> and ending with </svg>');
      return;
    }

    const id = `custom-${Date.now()}`;
    const newEntry: SvgIconEntry = {
      id,
      name: svgName.trim(),
      svg: cleanSvg,
      tags: ['custom'],
    };

    const updated = [...customSvgs, newEntry];
    setSvgName('');
    setSvgMarkup('');
    saveAll(categories, bookmarks, updated);
  };

  const handleDeleteSvg = (id: string) => {
    const updated = customSvgs.filter((s) => s.id !== id);
    saveAll(categories, bookmarks, updated);
  };

  const allIconsForAdmin = useMemo(() => {
    const combined = [
      ...BUILTIN_SVGS.map((b) => ({ ...b, isCustom: false })),
      ...customSvgs.map((c) => ({ ...c, category: 'general' as const, isCustom: true })),
    ];
    if (!searchSvg.trim()) return combined;
    const q = searchSvg.toLowerCase();
    return combined.filter(
      (item) => item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
    );
  }, [customSvgs, searchSvg]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-150 select-none cursor-default"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[780px] h-[85vh] bg-[#10131d] border border-slate-700/80 rounded-2xl shadow-2xl shadow-black overflow-hidden flex flex-col text-slate-100 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/70">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Bookmarks & SVG Database Admin
              </h2>
              <p className="text-xs text-slate-400">
                Organize left-hand category sections and manage white monochrome SVGs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('categories')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition flex items-center space-x-2 ${
              activeTab === 'categories'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Category Sections ({categories.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('svgs')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition flex items-center space-x-2 ${
              activeTab === 'svgs'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>SVG Icon Database ({BUILTIN_SVGS.length + customSvgs.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'categories' ? (
            <div className="space-y-6">
              {/* Add Category Form */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center space-x-3">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  placeholder="New Category Name (e.g. WORK, GENERAL, DEV)"
                  className="flex-1 bg-slate-950/80 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  disabled={!newCatName.trim() || isSaving}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Category</span>
                </button>
              </div>

              {/* Category Sections List */}
              <div className="space-y-4">
                {categories.map((cat, catIdx) => {
                  const catBms = bookmarks
                    .filter((b) => b.category_id === cat.id)
                    .sort((a, b) => a.order - b.order);

                  const isEditingThis = editingCatId === cat.id;

                  return (
                    <div
                      key={cat.id}
                      className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition space-y-3"
                    >
                      {/* Category Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            #{catIdx + 1}
                          </span>
                          {isEditingThis ? (
                            <div className="flex items-center space-x-2">
                              <input
                                type="text"
                                value={editingCatName}
                                onChange={(e) => setEditingCatName(e.target.value)}
                                className="bg-slate-950 border border-indigo-500 rounded px-2 py-1 text-xs text-white"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleRenameCategory(cat.id)}
                                className="p-1 text-emerald-400 hover:text-emerald-300"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCatId(null)}
                                className="p-1 text-slate-400 hover:text-slate-200"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                              {cat.name} ({catBms.length})
                            </h3>
                          )}
                        </div>

                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleMoveCategory(catIdx, 'up')}
                            disabled={catIdx === 0}
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800 transition"
                            title="Move Category Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveCategory(catIdx, 'down')}
                            disabled={catIdx === categories.length - 1}
                            className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800 transition"
                            title="Move Category Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          {!isEditingThis && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCatId(cat.id);
                                setEditingCatName(cat.name);
                              }}
                              className="p-1 text-slate-400 hover:text-indigo-300 rounded hover:bg-slate-800 transition"
                              title="Rename Category"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="p-1 text-rose-400 hover:text-rose-300 rounded hover:bg-rose-500/10 transition ml-2"
                            title="Delete Category and its bookmarks"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Bookmarks in this category */}
                      {catBms.length === 0 ? (
                        <p className="text-[11px] text-slate-500 italic py-1">
                          No bookmarks in this category yet. Capture a window and convert to bookmark, or drag here.
                        </p>
                      ) : (
                        <div className="space-y-1.5 pt-1">
                          {catBms.map((bm, bmIdx) => {
                            const svgMarkup = getSvgMarkup(
                              bm.icon_id,
                              customSvgs.find((c) => c.id === bm.icon_id)?.svg
                            );

                            return (
                              <div
                                key={bm.id}
                                className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 text-xs"
                              >
                                <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                                  <div
                                    className="w-6 h-6 rounded bg-slate-800 text-white flex items-center justify-center p-1 shrink-0"
                                    dangerouslySetInnerHTML={{ __html: svgMarkup }}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <span className="font-semibold text-slate-200 truncate block">
                                      {bm.name}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-mono truncate block">
                                      {bm.action.args.join(' ') || bm.action.executable}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center space-x-1.5 shrink-0 pl-2">
                                  {/* Move to another category selector */}
                                  <select
                                    value={bm.category_id}
                                    onChange={(e) => handleMoveToCategory(bm.id, e.target.value)}
                                    className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-300 focus:outline-none"
                                    title="Move to another category"
                                  >
                                    {categories.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>

                                  <button
                                    type="button"
                                    onClick={() => handleMoveBookmark(cat.id, bmIdx, 'up')}
                                    disabled={bmIdx === 0}
                                    className="p-1 text-slate-400 hover:text-white disabled:opacity-20"
                                    title="Move up"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveBookmark(cat.id, bmIdx, 'down')}
                                    disabled={bmIdx === catBms.length - 1}
                                    className="p-1 text-slate-400 hover:text-white disabled:opacity-20"
                                    title="Move down"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditBookmark(bm)}
                                    className="p-1 text-slate-400 hover:text-indigo-300"
                                    title="Edit bookmark"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBookmark(bm.id)}
                                    className="p-1 text-rose-400 hover:text-rose-300"
                                    title="Delete bookmark"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Add Custom SVG Section */}
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span>Add Custom White SVG Icon</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        Icon Name:
                      </label>
                      <input
                        type="text"
                        value={svgName}
                        onChange={(e) => setSvgName(e.target.value)}
                        placeholder="e.g. My Custom Logo"
                        className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        SVG Markup (&lt;svg ...&gt;...&lt;/svg&gt;):
                      </label>
                      <textarea
                        value={svgMarkup}
                        onChange={(e) => setSvgMarkup(e.target.value)}
                        placeholder='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>'
                        rows={5}
                        className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    {svgError && (
                      <p className="text-xs text-rose-400 font-semibold">{svgError}</p>
                    )}

                    <button
                      type="button"
                      onClick={handleAddSvg}
                      disabled={isSaving}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Save to SVG Library</span>
                    </button>
                  </div>

                  {/* Preview Box */}
                  <div className="flex flex-col items-center justify-center p-6 rounded-xl bg-slate-950/80 border border-slate-800 text-center">
                    <span className="text-xs font-semibold text-slate-400 mb-3">
                      White-on-Transparent Preview:
                    </span>
                    <div className="w-16 h-16 rounded-2xl bg-[#141824] border border-slate-700/80 flex items-center justify-center text-white shadow-xl p-3">
                      {svgMarkup.trim().startsWith('<svg') ? (
                        <div
                          className="w-10 h-10 flex items-center justify-center"
                          dangerouslySetInnerHTML={{ __html: svgMarkup }}
                        />
                      ) : (
                        <span className="text-[10px] text-slate-600 font-mono">No SVG</span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 mt-3 font-semibold">
                      {svgName || 'Icon Name'}
                    </span>
                  </div>
                </div>
              </div>

              {/* All SVGs Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Available SVG Icons ({allIconsForAdmin.length})
                  </h3>
                  <div className="relative w-56">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      value={searchSvg}
                      onChange={(e) => setSearchSvg(e.target.value)}
                      placeholder="Search SVGs..."
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                  {allIconsForAdmin.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-slate-900/50 border border-slate-800/80 hover:border-slate-700 flex flex-col items-center justify-center text-center group relative"
                    >
                      <div
                        className="w-7 h-7 flex items-center justify-center text-white"
                        dangerouslySetInnerHTML={{ __html: item.svg }}
                      />
                      <span className="text-[10px] font-semibold text-slate-300 truncate w-full mt-2">
                        {item.name}
                      </span>
                      <span className="text-[8px] font-mono text-slate-500">
                        {item.isCustom ? 'Custom' : 'Built-in'}
                      </span>
                      {item.isCustom && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSvg(item.id)}
                          className="absolute top-1.5 right-1.5 p-1 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition"
                          title="Delete custom SVG"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/70">
          <span className="text-[11px] text-slate-500 font-mono">
            {categories.length} Category Sections &bull; {bookmarks.length} Bookmarks
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
          >
            Done
          </button>
        </div>
      </div>

      {/* Edit Bookmark Sub-Modal */}
      {editingBookmark && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-100">
          <div className="w-[460px] bg-[#141724] border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white">Edit Bookmark</h3>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Name:</label>
              <input
                type="text"
                value={editBmName}
                onChange={(e) => setEditBmName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Target URL or Executable:
              </label>
              <input
                type="text"
                value={editBmTarget}
                onChange={(e) => setEditBmTarget(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Icon:</label>
              <div className="grid grid-cols-6 gap-2 max-h-32 overflow-y-auto p-2 bg-slate-950 rounded-lg border border-slate-800">
                {BUILTIN_SVGS.map((icon) => (
                  <button
                    key={icon.id}
                    type="button"
                    onClick={() => setEditBmIcon(icon.id)}
                    className={`p-2 rounded flex items-center justify-center ${
                      editBmIcon === icon.id
                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                        : 'bg-slate-900 text-slate-300 hover:text-white'
                    }`}
                  >
                    <div
                      className="w-4 h-4"
                      dangerouslySetInnerHTML={{ __html: icon.svg }}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingBookmark(null)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditBookmark}
                className="px-4 py-1.5 bg-indigo-600 text-white rounded text-xs font-semibold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
