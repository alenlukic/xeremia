import { useRef, useEffect, useCallback } from 'react';
import { useDndMonitor } from '@dnd-kit/core';

const EDGE_ZONE = 48;
const SCROLL_SPEED = 8;

export function useEdgeAutoScroll(scrollRef: React.RefObject<HTMLElement | null>) {
  const rafRef = useRef<number | null>(null);
  const directionRef = useRef<-1 | 0 | 1>(0);
  const activeRef = useRef(false);

  const stopScroll = useCallback(() => {
    directionRef.current = 0;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    const el = scrollRef.current;
    if (!el || directionRef.current === 0) {
      rafRef.current = null;
      return;
    }
    el.scrollTop += directionRef.current * SCROLL_SPEED;
    rafRef.current = requestAnimationFrame(tick);
  }, [scrollRef]);

  const updateFromPointer = useCallback((clientY: number) => {
    const el = scrollRef.current;
    if (!el || !activeRef.current) return;
    const rect = el.getBoundingClientRect();
    const relTop = clientY - rect.top;
    const relBot = rect.bottom - clientY;

    let dir: -1 | 0 | 1 = 0;
    if (relTop >= 0 && relTop < EDGE_ZONE && el.scrollTop > 0) {
      dir = -1;
    } else if (relBot >= 0 && relBot < EDGE_ZONE && el.scrollTop < el.scrollHeight - el.clientHeight) {
      dir = 1;
    }

    if (dir !== directionRef.current) {
      directionRef.current = dir;
      if (dir !== 0 && rafRef.current === null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
  }, [scrollRef, tick]);

  useDndMonitor({
    onDragStart() {
      activeRef.current = true;
    },
    onDragMove(event) {
      const e = event.activatorEvent;
      if (e instanceof PointerEvent || e instanceof MouseEvent) {
        const delta = event.delta;
        updateFromPointer((e as PointerEvent).clientY + delta.y);
      }
    },
    onDragEnd() {
      activeRef.current = false;
      stopScroll();
    },
    onDragCancel() {
      activeRef.current = false;
      stopScroll();
    },
  });

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);
}
