import { useCallback, useRef, useEffect, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';

export type PanelKey = 'matches' | 'set' | 'explorer';

interface Props {
  activePanel: PanelKey | null;
  onPanelChange: (panel: PanelKey | null) => void;
  setLabel?: string;
  panelHeight: number;
  onPanelHeightChange: (h: number) => void;
  defaultHeight: number;
  isDragging?: boolean;
}

const PANELS: { key: PanelKey; label: string }[] = [
  { key: 'matches', label: 'Matches' },
  { key: 'set', label: 'Set' },
  { key: 'explorer', label: 'Explorer' },
];

const MIN_PANEL_HEIGHT = 120;
const MAX_PANEL_RATIO = 0.7;

function DockDropTab({ panelKey, isActive, label, tabIndex, onToggle, isDragging }: {
  panelKey: PanelKey;
  isActive: boolean;
  label: string;
  tabIndex: number;
  onToggle: (key: PanelKey) => void;
  isDragging?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `dock-${panelKey}` });
  return (
    <button
      ref={setNodeRef}
      id={`dock-tab-${panelKey}`}
      role="tab"
      className={`dock-tab${isActive ? ' dock-tab--active' : ''}${isOver ? ' dock-tab--drop-hover' : ''}${isDragging && !isActive ? ' dock-tab--drop-ready' : ''}`}
      aria-selected={isActive}
      aria-controls={`panel-${panelKey}`}
      tabIndex={tabIndex}
      data-panel={panelKey}
      onClick={() => onToggle(panelKey)}
    >
      {label}
    </button>
  );
}

export function DockBar({
  activePanel,
  onPanelChange,
  setLabel,
  panelHeight,
  onPanelHeightChange,
  defaultHeight,
  isDragging: isDraggingProp,
}: Props) {
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);
  const [isResizing, setIsResizing] = useState(false);

  const handleToggle = useCallback(
    (key: PanelKey) => {
      onPanelChange(activePanel === key ? null : key);
    },
    [activePanel, onPanelChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.getAttribute('role') !== 'tab') return;

      const currentIdx = PANELS.findIndex((p) => p.key === target.dataset.panel);
      let nextIdx = -1;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIdx = (currentIdx + 1) % PANELS.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIdx = (currentIdx - 1 + PANELS.length) % PANELS.length;
      } else if (e.key === 'Home') {
        e.preventDefault();
        nextIdx = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        nextIdx = PANELS.length - 1;
      }

      if (nextIdx >= 0) {
        const nextBtn = document.querySelector(
          `.dock-tab[data-panel="${PANELS[nextIdx].key}"]`,
        ) as HTMLElement | null;
        nextBtn?.focus();
      }
    },
    [],
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (!activePanel) return;
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      startH.current = panelHeight;
      setIsResizing(true);
    },
    [activePanel, panelHeight],
  );

  const handleResetSplit = useCallback(() => {
    if (activePanel) {
      onPanelHeightChange(defaultHeight);
    }
  }, [activePanel, defaultHeight, onPanelHeightChange]);

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startY.current - e.clientY;
      const maxH = window.innerHeight * MAX_PANEL_RATIO;
      const next = Math.max(MIN_PANEL_HEIGHT, Math.min(startH.current + delta, maxH));
      onPanelHeightChange(next);
    };

    const onUp = () => {
      dragging.current = false;
      setIsResizing(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizing, onPanelHeightChange]);

  return (
    <div className="dock-bar-zone">
      <div
        className={`dock-resize-handle${activePanel ? ' dock-resize-handle--active' : ''}${isResizing ? ' dock-resize-handle--dragging' : ''}`}
        onMouseDown={handleResizeStart}
        onDoubleClick={handleResetSplit}
        role="separator"
        aria-orientation="horizontal"
        aria-valuenow={activePanel ? panelHeight : 0}
      />
      <div className="dock-bar" role="tablist" aria-label="Panels" onKeyDown={handleKeyDown}>
        {PANELS.map((p) => (
          <DockDropTab
            key={p.key}
            panelKey={p.key}
            isActive={activePanel === p.key}
            label={p.key === 'set' && setLabel ? setLabel : p.label}
            tabIndex={activePanel === p.key || (activePanel === null && p.key === 'matches') ? 0 : -1}
            onToggle={handleToggle}
            isDragging={isDraggingProp}
          />
        ))}
      </div>
    </div>
  );
}
