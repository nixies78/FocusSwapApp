import { useState, useEffect, useMemo, useCallback } from 'react';
import { SlidersHorizontal, X, Monitor, Sparkles, Layers } from 'lucide-react';
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
}

export default function RadialMenu({
  presets,
  activeSessionId,
  onSelectPreset,
  onSelectGeneral,
  onOpenManager,
  onClose,
}: RadialMenuProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [keyboardIndex, setKeyboardIndex] = useState<number>(0);

  const items = useMemo<RadialItem[]>(() => {
    const generalItem: RadialItem = {
      id: '__general__',
      name: 'General Desktop',
      shortcut: '0',
      isGeneral: true,
    };

    const workspaceItems: RadialItem[] = presets.map((p, idx) => ({
      id: p.id,
      name: p.name,
      shortcut: p.shortcut || String(idx + 1),
      isGeneral: false,
      preset: p,
    }));

    return [generalItem, ...workspaceItems];
  }, [presets]);

  const total = items.length;

  // Active highlighted item is hovered item, or keyboard selection if not hovering
  const activeIndex = hoveredIndex !== null ? hoveredIndex : keyboardIndex;
  const activeItem = items[activeIndex] || items[0];

  const handleExecute = useCallback((item: RadialItem) => {
    if (item.isGeneral) {
      onSelectGeneral();
    } else if (item.preset) {
      onSelectPreset(item.preset);
    }
  }, [onSelectGeneral, onSelectPreset]);

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
        if (activeItem) {
          handleExecute(activeItem);
        }
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'Tab') {
        e.preventDefault();
        setKeyboardIndex((prev) => (prev + 1) % total);
        setHoveredIndex(null);
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setKeyboardIndex((prev) => (prev - 1 + total) % total);
        setHoveredIndex(null);
        return;
      }

      // Check number shortcuts
      const matched = items.find((it) => it.shortcut === e.key);
      if (matched) {
        e.preventDefault();
        handleExecute(matched);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, activeItem, total, handleExecute, onClose]);

  // SVG Geometry Dimensions
  const size = 640;
  const center = size / 2;
  const outerR = 270;
  const innerR = 125;
  const textR = (outerR + innerR) / 2;

  const sliceAngle = 360 / total;
  // Gap between sectors in degrees
  const gapAngle = total > 1 ? Math.min(2.5, 360 / (total * 8)) : 0;

  // Compute slice SVG paths
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

      // Outer arc endpoints
      const x1_out = center + outerR * Math.cos(radStart);
      const y1_out = center + outerR * Math.sin(radStart);
      const x2_out = center + outerR * Math.cos(radEnd);
      const y2_out = center + outerR * Math.sin(radEnd);

      // Inner arc endpoints
      const x1_in = center + innerR * Math.cos(radStart);
      const y1_in = center + innerR * Math.sin(radStart);
      const x2_in = center + innerR * Math.cos(radEnd);
      const y2_in = center + innerR * Math.sin(radEnd);

      const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;

      // Closed donut slice path
      const pathData = total === 1
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

      // Label position
      const textX = center + textR * Math.cos(radMid);
      const textY = center + textR * Math.sin(radMid);

      const isActiveSession = item.isGeneral
        ? activeSessionId === null
        : activeSessionId === item.id;

      return {
        item,
        index,
        pathData,
        textX,
        textY,
        centerAngle,
        isActiveSession,
      };
    });
  }, [items, total, sliceAngle, gapAngle, center, outerR, innerR, textR, activeSessionId]);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.backdrop === 'true') {
          onClose();
        }
      }}
      data-backdrop="true"
      className="relative w-screen h-screen flex items-center justify-center select-none bg-slate-950/75 backdrop-blur-md overflow-hidden cursor-default"
    >
      {/* Background Radial Glow */}
      <div
        data-backdrop="true"
        className="absolute w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none"
      />

      {/* Top Right Floating Controls */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-8 right-8 flex items-center gap-3 z-50"
      >
        <button
          onClick={onOpenManager}
          className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/90 hover:bg-slate-800/95 text-slate-200 hover:text-white rounded-xl border border-slate-700/70 shadow-2xl backdrop-blur-xl transition-all duration-150 hover:border-indigo-500/50 hover:shadow-indigo-500/20 active:scale-95 group font-medium text-sm"
          title="Manage Workspaces"
        >
          <SlidersHorizontal size={16} className="text-indigo-400 group-hover:rotate-45 transition-transform duration-300" />
          <span>Manage Workspaces</span>
        </button>

        <button
          onClick={onClose}
          className="p-2.5 bg-slate-900/90 hover:bg-slate-800/95 text-slate-400 hover:text-white rounded-xl border border-slate-700/70 shadow-2xl backdrop-blur-xl transition-all duration-150 active:scale-95 hover:border-slate-500"
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
              <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#6366f1" floodOpacity="0.55" />
            </filter>
            {/* Linear Gradient for Hovered Slices */}
            <linearGradient id="hoverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4338ca" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#312e81" stopOpacity="0.95" />
            </linearGradient>
            {/* Default Slice Gradient */}
            <linearGradient id="sliceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e293b" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95" />
            </linearGradient>
          </defs>

          {/* Slices */}
          {slices.map((slice) => {
            const isHighlighted = activeIndex === slice.index;

            return (
              <g
                key={slice.item.id}
                className="cursor-pointer transition-all duration-150"
                onMouseEnter={() => setHoveredIndex(slice.index)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => handleExecute(slice.item)}
              >
                {/* Sector Path */}
                <path
                  d={slice.pathData}
                  fill={isHighlighted ? 'url(#hoverGrad)' : 'url(#sliceGrad)'}
                  stroke={isHighlighted ? '#818cf8' : '#334155'}
                  strokeWidth={isHighlighted ? 2.5 : 1.5}
                  filter={isHighlighted ? 'url(#glow)' : undefined}
                  className="transition-colors duration-150"
                />

                {/* Text Label */}
                <g transform={`translate(${slice.textX}, ${slice.textY})`}>
                  {/* Workspace Name */}
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={isHighlighted ? '#ffffff' : '#e2e8f0'}
                    fontSize={isHighlighted ? '16' : '15'}
                    fontWeight={isHighlighted ? '700' : '600'}
                    letterSpacing="0.02em"
                    className="pointer-events-none select-none transition-all duration-150 font-sans"
                  >
                    {slice.item.name}
                  </text>
                </g>
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
          {activeItem ? (
            <div className="flex flex-col items-center px-3 animate-in fade-in zoom-in-95 duration-150">
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center mb-1.5 text-indigo-300">
                {activeItem.isGeneral ? (
                  <Monitor size={16} />
                ) : (
                  <Layers size={16} />
                )}
              </div>
              <span className="text-sm font-semibold text-white truncate max-w-[150px]">
                {activeItem.name}
              </span>
              <span className="text-[11px] text-indigo-300/80 mt-0.5 font-medium">
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
        <span><strong className="text-slate-400">1-{Math.max(1, presets.length)}</strong> Workspaces</span>
        <span><strong className="text-slate-400">Hover / Click</strong> Select</span>
        <span><strong className="text-slate-400">Esc</strong> Close</span>
      </div>
    </div>
  );
}
