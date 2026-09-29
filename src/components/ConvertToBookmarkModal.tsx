import { useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Bookmark as BookmarkIcon, Plus, Search, Check } from 'lucide-react';
import { Action, Bookmark, BookmarkCategory, BookmarkConfig, SvgIconEntry } from '../types';
import { BUILTIN_SVGS, detectDefaultIcon, getSvgMarkup } from '../utils/svgLibrary';

interface ConvertToBookmarkModalProps {
  isOpen: boolean;
  action: Action | null;
  onClose: () => void;
  onSuccess: (bookmarkName: string) => void;
}

export default function ConvertToBookmarkModal({
  isOpen,
  action,
  onClose,
  onSuccess,
}: ConvertToBookmarkModalProps) {
  const [categories, setCategories] = useState<BookmarkCategory[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [customSvgs, setCustomSvgs] = useState<SvgIconEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('work');
  const [selectedIconId, setSelectedIconId] = useState('globe');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [searchIcon, setSearchIcon] = useState('');

  // Load current bookmarks & categories when modal opens
  useMemo(() => {
    if (!isOpen || !action) return;

    invoke<BookmarkConfig>('get_bookmarks')
      .then((cfg) => {
        setCategories(cfg.categories || []);
        setBookmarks(cfg.bookmarks || []);
        setCustomSvgs(cfg.custom_svgs || []);

        if (cfg.categories && cfg.categories.length > 0) {
          setSelectedCategoryId(cfg.categories[0].id);
        }

        // Pre-fill Name & Icon
        const initialTitle = action.title || action.executable || 'New Bookmark';
        setName(initialTitle);

        const targetStr = action.args.join(' ') || action.executable;
        const suggestedIcon = detectDefaultIcon(initialTitle, targetStr);
        setSelectedIconId(suggestedIcon);
      })
      .catch((err) => {
        console.error('Failed to load bookmarks config:', err);
      });
  }, [isOpen, action]);

  const allAvailableIcons = useMemo(() => {
    const list = [...BUILTIN_SVGS];
    for (const c of customSvgs) {
      list.push({
        id: c.id,
        name: c.name,
        category: 'general',
        svg: c.svg,
      });
    }
    if (!searchIcon.trim()) return list;
    const q = searchIcon.toLowerCase();
    return list.filter((item) => item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q));
  }, [customSvgs, searchIcon]);

  if (!isOpen || !action) return null;

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    const id = newCategoryName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const newCat: BookmarkCategory = {
      id,
      name: newCategoryName.trim(),
      order: categories.length,
    };
    setCategories([...categories, newCat]);
    setSelectedCategoryId(id);
    setNewCategoryName('');
    setIsCreatingCategory(false);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const newBookmark: Bookmark = {
        id: `bm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: name.trim(),
        category_id: selectedCategoryId || 'general',
        icon_id: selectedIconId,
        action: { ...action },
        order: bookmarks.filter((b) => b.category_id === selectedCategoryId).length,
      };

      const updatedBookmarks = [...bookmarks, newBookmark];
      const updatedConfig: BookmarkConfig = {
        categories,
        bookmarks: updatedBookmarks,
        custom_svgs: customSvgs,
      };

      await invoke('save_bookmarks', { bookmarks: updatedConfig });
      onSuccess(name.trim());
      onClose();
    } catch (err) {
      console.error('Failed to save bookmark:', err);
    } finally {
      setSaving(false);
    }
  };

  const currentSvgMarkup = getSvgMarkup(
    selectedIconId,
    customSvgs.find((c) => c.id === selectedIconId)?.svg
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-150 select-none cursor-default"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[520px] max-h-[90vh] bg-[#12141f] border border-slate-700/80 rounded-2xl shadow-2xl shadow-black overflow-hidden flex flex-col text-slate-100 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <BookmarkIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-wide text-slate-100">
                Convert to Left-Hand Bookmark
              </h2>
              <p className="text-[11px] text-slate-400">
                Creates a direct 1-click trigger in the left sidebar
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-130px)]">
          {/* Bookmark Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Bookmark Name:
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Homepage"
              className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          {/* Category Selector */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300">
                Category Section:
              </label>
              {!isCreatingCategory && (
                <button
                  type="button"
                  onClick={() => setIsCreatingCategory(true)}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Category</span>
                </button>
              )}
            </div>

            {isCreatingCategory ? (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New Category Name (e.g. Work, General)"
                  className="flex-1 bg-slate-900 border border-indigo-500/80 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingCategory(false)}
                  className="px-2 py-1.5 bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name.toUpperCase()}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Target Action Info */}
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs font-mono space-y-1">
            <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider block">
              Trigger Target
            </span>
            <p className="text-slate-300 truncate">
              {action.executable} {action.args.length > 0 && `(${action.args.join(' ')})`}
            </p>
          </div>

          {/* SVG Icon Picker */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300">
                Pick White Monochrome SVG Icon:
              </label>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] text-slate-400">Preview:</span>
                <div
                  className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-600 flex items-center justify-center text-white shadow-sm p-1.5"
                  dangerouslySetInnerHTML={{ __html: currentSvgMarkup }}
                />
              </div>
            </div>

            {/* Icon Search */}
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchIcon}
                onChange={(e) => setSearchIcon(e.target.value)}
                placeholder="Search SVG icons..."
                className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Icon Grid */}
            <div className="grid grid-cols-6 gap-2 p-2 bg-slate-950/70 border border-slate-800 rounded-xl max-h-44 overflow-y-auto">
              {allAvailableIcons.map((item) => {
                const isSelected = selectedIconId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedIconId(item.id)}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl transition border cursor-pointer relative group ${
                      isSelected
                        ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-sm shadow-indigo-950'
                        : 'bg-slate-900/60 hover:bg-slate-800/80 border-slate-800/80 hover:border-slate-700 text-slate-300 hover:text-white'
                    }`}
                    title={item.name}
                  >
                    <div
                      className="w-5 h-5 flex items-center justify-center"
                      dangerouslySetInnerHTML={{ __html: item.svg }}
                    />
                    <span className="text-[9px] font-mono mt-1 text-slate-400 truncate w-full text-center group-hover:text-slate-200">
                      {item.name.split('/')[0].trim()}
                    </span>
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-indigo-500 flex items-center justify-center text-white">
                        <Check className="w-2 h-2" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-slate-800 bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition shadow-md shadow-indigo-950/50 flex items-center space-x-2"
          >
            <span>{saving ? 'Saving...' : 'Add to Bookmarks'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
