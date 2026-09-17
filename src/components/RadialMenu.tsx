import { useState, useEffect, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SlidersHorizontal, X, Monitor, Sparkles, Layers, RefreshCw, Folder } from 'lucide-react';
import { Preset } from '../types';

interface RadialMenuProps {
  presets: Preset[];
  activeSessionId: string | null;
  onSelectPreset: (preset: Preset) => void;
  onSelectGeneral: () => void;
  onOpenManager: () => void;
  onClose: () => void;
}

interface RadialItem {
  id: string;
  name: string;
  shortcut: string;
  isGeneral: boolean;
  preset?: Preset;
  children: Preset[];
}

type HoverTarget =
  | { type: 'main'; index: number }
  | { type: 'child'; childPreset: Preset; parentItem: RadialItem }
  | null;

export default function RadialMenu({
  presets,
  activeSessionId,
  onSelectPreset,
  onSelectGeneral,
  onOpenManager,
  onClose,
}: RadialMenuProps) {
  const [hoverTarget, setHoverTarget] = useState<HoverTarget>(null);
  const [keyboardIndex, setKeyboardIndex] = useState<number>(0);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateAndRestart = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await invoke('update_and_restart');
    } catch (err) {
      console.error('Failed to trigger update and restart:', err);
      setIsUpdating(false);
    }
  };

  // Group presets into top-level and nested children
  const items = useMemo<RadialItem[]>(() => {
    const topLevelPresets = presets.filter((p) => !p.parent_id);
    const childPresets = presets.filter((p) => !!p.parent_id);

    const childrenMap = new Map<string, Preset[]>();
    for (const child of childPresets) {
      if (child.parent_id) {
        const list = childrenMap.get(child.parent_id) || [];
        list.push(child);
        childrenMap.set(child.parent_id, list);
      }
    }

    const generalItem: RadialItem = {
      id: '__general__',
      name: 'General Desktop',
      shortcut: '0',
      isGeneral: true,
      children: [],
    };

    const workspaceItems: RadialItem[] = topLevelPresets.map((p, idx) => ({
      id: p.id,
      name: p.name,
      shortcut: p.shortcut || String(idx + 1),
      isGeneral: false,
      preset: p,
      children: childrenMap.get(p.id) || [],
    }));

    return [generalItem, ...workspaceItems];
  }, [presets]);

  const total = items.length;

  const handleExecuteMain = useCallback(
    (item: RadialItem) => {
      if (item.isGeneral) {
        onSelectGeneral();
      } else if (item.preset) {
        onSelectPreset(item.preset);
      }
    },
    [onSelectGeneral, onSelectPreset]
  );

  const handleExecuteChild = useCallback(
    (childPreset: Preset) => {
      onSelectPreset(childPreset);
    },
    [onSelectPreset]
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (hoverTarget) {
          if (hoverTarget.type === 'main') {
            const item = items[hoverTarget.index];
            if (item) handleExecuteMain(item);
          } else if (hoverTarget.type === 'child') {
            handleExecuteChild(hoverTarget.childPreset);
          }
        } else {
          const item = items[keyboardIndex];
          if (item) handleExecuteMain(item);
        }
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Tab') {
        e.preventDefault();
        setKeyboardIndex((prev) => (prev + 1) % total);
        setHoverTarget(null);
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setKeyboardIndex((prev) => (prev - 1 + total) % total);
        setHoverTarget(null);
        return;
      }

      // Check number shortcuts
      const matched = items.find((it) => it.shortcut === e.key);
      if (matched) {
        e.preventDefault();
        handleExecuteMain(matched);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, hoverTarget, keyboardIndex, total, handleExecuteMain, handleExecuteChild, onClose]);

  // SVG Geometry Dimensions
  const size = 740;
  const center = size / 2;
  const outerR = 230;
  const innerR = 115;
  const textR = (outerR + innerR) / 2;

  // Outer ring for sub-workspaces
  const outerRingInnerR = 240;
  const outerRingOuterR = 325;
  const childTextR = (outerRingInnerR + outerRingOuterR) / 2;

  const sliceAngle = 360 / total;
  // Gap between sectors in degrees
  const gapAngle = total > 1 ? Math.min(2.5, 360 / (total * 8)) : 0;

  // Compute slice SVG paths for main donut ring and outer sub-workspace arcs
  const slices = useMemo(() => {
    return items.map((item, index) => {
      // Anchor item 0 (General) centered at top (-90 degrees)
      const centerAngle = -90 + index * sliceAngle;
      const startAngle = centerAngle - sliceAngle / 2 + gapAngle / 2;
      const endAngle = centerAngle + sliceAngle / 2 - gapAngle / 2;

      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const radStart = toRad(startAngle);
      const radEnd = toRad(endAngle);
      const radMid = toRad(centerAngle);

      // Outer arc endpoints for main ring
      const x1_out = center + outerR * Math.cos(radStart);
      const y1_out = center + outerR * Math.sin(radStart);
      const x2_out = center + outerR * Math.cos(radEnd);
      const y2_out = center + outerR * Math.sin(radEnd);

      // Inner arc endpoints for main ring
      const x1_in = center + innerR * Math.cos(radStart);
      const y1_in = center + innerR * Math.sin(radStart);
      const x2_in = center + innerR * Math.cos(radEnd);
      const y2_in = center + innerR * Math.sin(radEnd);

      const largeArc = endAngle - startAngle > 180 ? 1 : 0;

      // Closed donut slice path
      const pathData =
        total === 1
          ? `M ${center - outerR} ${center}
             A ${outerR} ${outerR} 0 1 0 ${center + outerR} ${center}
             A ${outerR} ${outerR} 0 1 0 ${center - outerR} ${center}
             M ${center - innerR} ${center}
             A ${innerR} ${innerR} 0 1 1 ${center + innerR} ${center}
             A ${innerR} ${innerR} 0 1 1 ${center - innerR} ${center} Z`
          : `M ${x1_in} ${y1_in}
             L ${x1_out} ${y1_out}
             A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2_out} ${y2_out}
             L ${x2_in} ${y2_in}
             A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1_in} ${y1_in}
             Z`;

      // Main label position
      const textX = center + textR * Math.cos(radMid);
      const textY = center + textR * Math.sin(radMid);

      const isActiveSession = item.isGeneral
        ? activeSessionId === null
        : activeSessionId === item.id;

      // Calculate outer sub-workspace slices (if any)
      const childSlices = (item.children || []).map((child, cIdx, arr) => {
        const count = arr.length;
        const subSpan = (endAngle - startAngle) / count;
        const subGap = count > 1 ? 2.0 : 0;

        const cStartDeg = startAngle + cIdx * subSpan + subGap / 2;
        const cEndDeg = startAngle + (cIdx + 1) * subSpan - subGap / 2;
        const cMidDeg = (cStartDeg + cEndDeg) / 2;

        const cRadStart = toRad(cStartDeg);
        const cRadEnd = toRad(cEndDeg);
        const cRadMid = toRad(cMidDeg);

        // Child outer arc endpoints
        const cx1_out = center + outerRingOuterR * Math.cos(cRadStart);
        const cy1_out = center + outerRingOuterR * Math.sin(cRadStart);
        const cx2_out = center + outerRingOuterR * Math.cos(cRadEnd);
        const cy2_out = center + outerRingOuterR * Math.sin(cRadEnd);

        // Child inner arc endpoints
        const cx1_in = center + outerRingInnerR * Math.cos(cRadStart);
        const cy1_in = center + outerRingInnerR * Math.sin(cRadStart);
        const cx2_in = center + outerRingInnerR * Math.cos(cRadEnd);
        const cy2_in = center + outerRingInnerR * Math.sin(cRadEnd);

        const cLargeArc = cEndDeg - cStartDeg > 180 ? 1 : 0;

        const childPath = `M ${cx1_in} ${cy1_in}
                           L ${cx1_out} ${cy1_out}
                           A ${outerRingOuterR} ${outerRingOuterR} 0 ${cLargeArc} 1 ${cx2_out} ${cy2_out}
                           L ${cx2_in} ${cy2_in}
                           A ${outerRingInnerR} ${outerRingInnerR} 0 ${cLargeArc} 0 ${cx1_in} ${cy1_in}
                           Z`;

        const childTextX = center + childTextR * Math.cos(cRadMid);
        const childTextY = center + childTextR * Math.sin(cRadMid);

        // Available arc width in pixels
        const arcWidthPx = childTextR * (((cEndDeg - cStartDeg) * Math.PI) / 180);
        const maxChars = Math.max(5, Math.floor(arcWidthPx / 8.5));
        const displayName =
          child.name.length > maxChars
            ? child.name.slice(0, maxChars - 1) + '…'
            : child.name;

        const fontSize = Math.min(
          13,
          Math.max(10, Math.floor((arcWidthPx / Math.max(child.name.length, 5)) * 1.2))
        );

        const isChildActive = activeSessionId === child.id;

        return {
          child,
          childPath,
          childTextX,
          childTextY,
          displayName,
          fontSize,
          isChildActive,
        };
      });

      return {
        item,
        index,
        pathData,
        textX,
        textY,
        centerAngle,
        isActiveSession,
        childSlices,
      };
    });
  }, [items, total, sliceAngle, gapAngle, center, outerR, innerR, textR, outerRingInnerR, outerRingOuterR, childTextR, activeSessionId]);

  // Determine currently active target for the center hub
  const activeDisplay = useMemo(() => {
    if (hoverTarget) {
      if (hoverTarget.type === 'child') {
        const isFolder = hoverTarget.childPreset.actions.some((a) =>
          a.executable.toLowerCase().includes('explorer')
        );
        return {
          title: hoverTarget.childPreset.name,
          subtitle: `Sub-workspace of ${hoverTarget.parentItem.name}`,
          isChild: true,
          isFolder,
          isGeneral: false,
        };
      }
      if (hoverTarget.type === 'main') {
        const item = items[hoverTarget.index];
        if (item) {
          return {
            title: item.name,
            subtitle:
              item.children.length > 0
                ? `${item.children.length} sub-workspace${item.children.length > 1 ? 's' : ''}`
                : 'Click to switch',
            isChild: false,
            isFolder: false,
            isGeneral: item.isGeneral,
          };
        }
      }
    }

    const defaultItem = items[keyboardIndex] || items[0];
    if (defaultItem) {
      return {
        title: defaultItem.name,
        subtitle:
          defaultItem.children.length > 0
            ? `${defaultItem.children.length} sub-workspace${defaultItem.children.length > 1 ? 's' : ''}`
            : 'Click to switch',
        isChild: false,
        isFolder: false,
        isGeneral: defaultItem.isGeneral,
      };
    }

    return null;
  }, [hoverTarget, items, keyboardIndex]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.backdrop === 'true') {
          onClose();
        }
      }}
      data-backdrop="true"
      className="relative w-screen h-screen flex items-center justify-center select-none bg-slate-950/80 backdrop-blur-md overflow-hidden cursor-default"
    >
      {/* Background Radial Glow */}
      <div
        data-backdrop="true"
        className="absolute w-[640px] h-[640px] rounded-full bg-indigo-600/10 blur-[130px] pointer-events-none"
      />

      {/* Top Left Floating Controls - Sync / Update & Restart */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-8 left-8 flex items-center gap-3 z-50"
      >
        <button
          onClick={handleUpdateAndRestart}
          disabled={isUpdating}
          className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/90 hover:bg-slate-800/95 text-slate-200 hover:text-white rounded-xl border border-slate-700/70 shadow-2xl backdrop-blur-xl transition-all duration-150 hover:border-cyan-500/50 hover:shadow-cyan-500/20 active:scale-95 group font-medium text-sm disabled:opacity-50 cursor-pointer"
          title="Pull latest update from Git and restart FocusDeck"
        >
          <RefreshCw
            size={16}
            className={`text-cyan-400 ${
              isUpdating ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'
            }`}
          />
          <span>{isUpdating ? 'Updating...' : 'Update & Restart'}</span>
        </button>
      </div>

      {/* Top Right Floating Controls */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-8 right-8 flex items-center gap-3 z-50"
      >
        <button
          onClick={onOpenManager}
          className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/90 hover:bg-slate-800/95 text-slate-200 hover:text-white rounded-xl border border-slate-700/70 shadow-2xl backdrop-blur-xl transition-all duration-150 hover:border-indigo-500/50 hover:shadow-indigo-500/20 active:scale-95 group font-medium text-sm cursor-pointer"
          title="Manage Workspaces"
        >
          <SlidersHorizontal
            size={16}
            className="text-indigo-400 group-hover:rotate-45 transition-transform duration-300"
          />
          <span>Manage Workspaces</span>
        </button>

        <button
          onClick={onClose}
          className="p-2.5 bg-slate-900/90 hover:bg-slate-800/95 text-slate-400 hover:text-white rounded-xl border border-slate-700/70 shadow-2xl backdrop-blur-xl transition-all duration-150 active:scale-95 hover:border-slate-500 cursor-pointer"
          title="Close (Esc)"
        >
          <X size={18} />
        </button>
      </div>

      {/* Radial Menu Container */}
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
        data-backdrop="true"
        className="relative flex items-center justify-center"
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onClose();
            }
          }}
          className="overflow-visible drop-shadow-2xl"
        >
          <defs>
            {/* Slice Highlight Filter */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#6366f1" floodOpacity="0.65" />
            </filter>
            <filter id="glowChild" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#818cf8" floodOpacity="0.75" />
            </filter>
            {/* Linear Gradient for Hovered Slices */}
            <linearGradient id="hoverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4338ca" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#312e81" stopOpacity="0.95" />
            </linearGradient>
            {/* Linear Gradient for Hovered Child Slices */}
            <linearGradient id="hoverChildGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#3730a3" stopOpacity="0.95" />
            </linearGradient>
            {/* Default Slice Gradient */}
            <linearGradient id="sliceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e293b" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95" />
            </linearGradient>
            {/* Default Child Slice Gradient */}
            <linearGradient id="childGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e293b" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#0b0f19" stopOpacity="0.85" />
            </linearGradient>
          </defs>

          {/* Slices */}
          {slices.map((slice) => {
            const isMainHighlighted =
              (hoverTarget?.type === 'main' && hoverTarget.index === slice.index) ||
              (!hoverTarget && keyboardIndex === slice.index);

            return (
              <g key={slice.item.id}>
                {/* Main Donut Sector */}
                <g
                  className="cursor-pointer transition-all duration-150"
                  onMouseEnter={() => setHoverTarget({ type: 'main', index: slice.index })}
                  onMouseLeave={() => setHoverTarget(null)}
                  onClick={() => handleExecuteMain(slice.item)}
                >
                  <path
                    d={slice.pathData}
                    fill={isMainHighlighted ? 'url(#hoverGrad)' : 'url(#sliceGrad)'}
                    stroke={isMainHighlighted ? '#818cf8' : slice.isActiveSession ? '#38bdf8' : '#334155'}
                    strokeWidth={isMainHighlighted ? 2.5 : slice.isActiveSession ? 2 : 1.5}
                    filter={isMainHighlighted ? 'url(#glow)' : undefined}
                    className="transition-colors duration-150"
                  />

                  {/* Main Label */}
                  <g transform={`translate(${slice.textX}, ${slice.textY})`}>
                    <text
                      x={0}
                      y={0}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={isMainHighlighted ? '#ffffff' : '#e2e8f0'}
                      fontSize={isMainHighlighted ? '15' : '14'}
                      fontWeight={isMainHighlighted ? '700' : '600'}
                      letterSpacing="0.02em"
                      className="pointer-events-none select-none transition-all duration-150 font-sans"
                    >
                      {slice.item.name}
                    </text>
                  </g>
                </g>

                {/* Outer Ring Nested Child Workspaces */}
                {slice.childSlices.map((cs) => {
                  const isChildHovered =
                    hoverTarget?.type === 'child' &&
                    hoverTarget.childPreset.id === cs.child.id;

                  return (
                    <g
                      key={cs.child.id}
                      className="cursor-pointer transition-all duration-150"
                      onMouseEnter={() =>
                        setHoverTarget({
                          type: 'child',
                          childPreset: cs.child,
                          parentItem: slice.item,
                        })
                      }
                      onMouseLeave={() => setHoverTarget(null)}
                      onClick={() => handleExecuteChild(cs.child)}
                    >
                      <title>{cs.child.name} (Sub-workspace of {slice.item.name})</title>
                      <path
                        d={cs.childPath}
                        fill={isChildHovered ? 'url(#hoverChildGrad)' : 'url(#childGrad)'}
                        stroke={isChildHovered ? '#a5b4fc' : cs.isChildActive ? '#38bdf8' : '#475569'}
                        strokeWidth={isChildHovered ? 2.5 : cs.isChildActive ? 2 : 1.2}
                        filter={isChildHovered ? 'url(#glowChild)' : undefined}
                        className="transition-colors duration-150"
                      />

                      {/* Child Label */}
                      <g transform={`translate(${cs.childTextX}, ${cs.childTextY})`}>
                        <text
                          x={0}
                          y={0}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill={isChildHovered ? '#ffffff' : '#cbd5e1'}
                          fontSize={cs.fontSize}
                          fontWeight={isChildHovered ? '700' : '500'}
                          letterSpacing="0.01em"
                          className="pointer-events-none select-none transition-all duration-150 font-sans"
                        >
                          {cs.displayName}
                        </text>
                      </g>
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Center Hub Core */}
          <circle
            cx={center}
            cy={center}
            r={innerR - 8}
            fill="#090d16"
            stroke="#334155"
            strokeWidth={2}
            className="cursor-pointer transition-all duration-150 hover:border-slate-500"
            onClick={onClose}
          />
        </svg>

        {/* Center Hub Interactive HTML Content */}
        <div
          onClick={onClose}
          className="absolute flex flex-col items-center justify-center text-center pointer-events-none w-[180px] h-[180px] rounded-full"
        >
          {activeDisplay ? (
            <div className="flex flex-col items-center px-3 animate-in fade-in zoom-in-95 duration-150">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center mb-1.5 border ${
                  activeDisplay.isFolder
                    ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                    : activeDisplay.isGeneral
                    ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-300'
                    : 'bg-indigo-500/20 border-indigo-400/40 text-indigo-300'
                }`}
              >
                {activeDisplay.isFolder ? (
                  <Folder size={16} />
                ) : activeDisplay.isGeneral ? (
                  <Monitor size={16} />
                ) : (
                  <Layers size={16} />
                )}
              </div>
              <span className="text-sm font-semibold text-white truncate max-w-[150px]">
                {activeDisplay.title}
              </span>
              <span className="text-[10px] text-indigo-300/90 mt-0.5 font-medium truncate max-w-[150px]">
                {activeDisplay.subtitle}
              </span>
              <span className="text-[9px] text-slate-400 mt-1 font-mono uppercase tracking-wider">
                Click to switch
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <Sparkles size={20} className="text-indigo-400 mb-1" />
              <span className="text-xs text-slate-400 font-medium">Select Workspace</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Hint */}
      <div className="absolute bottom-6 flex items-center gap-6 text-xs text-slate-500 font-mono">
        <span><strong className="text-slate-400">0</strong> General</span>
        <span><strong className="text-slate-400">1-{Math.max(1, items.length - 1)}</strong> Workspaces</span>
        <span><strong className="text-slate-400">Outer Ring</strong> Sub-workspaces</span>
        <span><strong className="text-slate-400">Hover / Click</strong> Select</span>
        <span><strong className="text-slate-400">Esc</strong> Close</span>
      </div>
    </div>
  );
}
