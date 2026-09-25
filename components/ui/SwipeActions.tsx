import React, { useEffect, useRef } from 'react';

export interface SwipeAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}

interface SwipeActionsProps {
  children: React.ReactNode;
  /** Buttons revealed when the row is swiped to the left. */
  actions: SwipeAction[];
  className?: string;
}

const ACTION_WIDTH = 64; // w-16
const ENGAGE_THRESHOLD = 12; // px of horizontal travel before a swipe engages
const OPEN_RATIO = 0.4; // release past 40% of the actions width snaps open
const RUBBER = 0.3; // resistance factor past the open/closed limits

/**
 * Touch-friendly reveal-on-swipe wrapper for mobile list rows.
 *
 * Action buttons sit absolutely positioned behind the row content, right-aligned;
 * swiping the content left exposes them. Mouse interaction and vertical scrolling
 * are untouched — only touch gestures engage the reveal. Gesture updates are applied
 * directly to the content element's transform to avoid re-rendering on every move.
 */
export const SwipeActions: React.FC<SwipeActionsProps> = ({ children, actions, className = '' }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  // Mutable gesture state kept in a ref so touchmove never triggers a re-render.
  const gesture = useRef({
    active: false, // pointer is down and still tracking
    engaged: false, // gesture has been classified as a horizontal swipe
    startX: 0,
    startY: 0,
    startOffset: 0,
    offset: 0,
    maxOffset: actions.length * ACTION_WIDTH,
    suppressClick: false, // swallow the click that follows a drag
  });

  const setTransform = (x: number, animate: boolean) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 200ms ease-out' : 'none';
    el.style.transform = `translate3d(${x}px, 0, 0)`;
  };

  const snapTo = (x: number) => {
    gesture.current.offset = x;
    setTransform(x, true);
  };

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const g = gesture.current;
      const touch = e.touches[0];
      g.active = true;
      g.engaged = false;
      g.startX = touch.clientX;
      g.startY = touch.clientY;
      g.startOffset = g.offset;
      g.maxOffset = actionsRef.current?.offsetWidth || actions.length * ACTION_WIDTH;
    };

    const onMove = (e: TouchEvent) => {
      const g = gesture.current;
      if (!g.active) return;
      const touch = e.touches[0];
      const dx = touch.clientX - g.startX;
      const dy = touch.clientY - g.startY;

      if (!g.engaged) {
        // Engage only on a clearly horizontal gesture; otherwise let the page scroll.
        if (Math.abs(dx) > ENGAGE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
          g.engaged = true;
        } else if (Math.abs(dy) > ENGAGE_THRESHOLD) {
          g.active = false;
          return;
        } else {
          return;
        }
      }

      if (e.cancelable) e.preventDefault();

      let next = g.startOffset + dx;
      // Rubber-band resistance past the open/closed limits.
      if (next < -g.maxOffset) {
        next = -g.maxOffset + (next + g.maxOffset) * RUBBER;
      } else if (next > 0) {
        next = next * RUBBER;
      }

      g.offset = next;
      setTransform(next, false);
    };

    const onEnd = () => {
      const g = gesture.current;
      if (!g.active) return;
      g.active = false;
      if (g.engaged) {
        // A swipe just happened — make sure the trailing click is ignored.
        g.suppressClick = true;
        g.engaged = false;
        snapTo(g.offset < -g.maxOffset * OPEN_RATIO ? -g.maxOffset : 0);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [actions.length]);

  if (actions.length === 0) return <>{children}</>;

  const handleActionClick = (action: SwipeAction) => {
    action.onClick();
    snapTo(0);
  };

  const handleContentClick = (e: React.MouseEvent) => {
    const g = gesture.current;
    if (g.suppressClick) {
      g.suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Tapping the content closes an open reveal.
    if (g.offset !== 0) snapTo(0);
  };

  return (
    <div ref={wrapperRef} className={`relative overflow-hidden ${className}`} style={{ touchAction: 'pan-y' }}>
      <div ref={actionsRef} className="absolute inset-y-0 right-0 flex">
        {actions.map((action, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleActionClick(action)}
            className={`w-16 h-full flex flex-col items-center justify-center gap-1 text-[10px] font-bold ${action.className || ''}`}
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
      </div>
      <div
        ref={contentRef}
        className="relative z-10 h-full"
        style={{ willChange: 'transform' }}
        onClick={handleContentClick}
      >
        {children}
      </div>
    </div>
  );
};
