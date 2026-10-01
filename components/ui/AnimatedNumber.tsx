
import React, { useEffect, useRef, useState } from 'react';

const DEFAULT_FORMAT = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

interface AnimatedNumberProps {
  value: number | null | undefined;
  /** Number formatter — output characters drive the odometer columns. */
  format?: (v: number) => string;
  /** 'roll' = odometer digit strips (default); 'count' = eased count-up. */
  mode?: 'roll' | 'count';
  duration?: number; // ms
  className?: string;
}

let prefersReducedMotion: boolean | null = null;
const motionReduced = () => {
  if (prefersReducedMotion === null && typeof window !== 'undefined') {
    prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return prefersReducedMotion ?? false;
};

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Rolling odometer number. The formatted value is split into characters;
 * digits render as vertical 0-9 strips that translate to their target with a
 * staggered, right-to-left ease. Separators, currency and signs stay static.
 */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  format = DEFAULT_FORMAT,
  mode = 'roll',
  duration = 900,
  className = '',
}) => {
  const prevValue = useRef<number | null>(null);
  const [displayValue, setDisplayValue] = useState<number>(value ?? 0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const target = value ?? 0;
    if (prevValue.current === null || motionReduced()) {
      prevValue.current = target;
      setDisplayValue(target);
      return;
    }
    const from = prevValue.current;
    prevValue.current = target;
    if (from === target) {
      setDisplayValue(target);
      return;
    }
    if (mode === 'count') {
      const start = performance.now();
      let raf = 0;
      setAnimating(true);
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        setDisplayValue(from + (target - from) * easeOut(t));
        if (t < 1) raf = requestAnimationFrame(tick);
        else { setDisplayValue(target); setAnimating(false); }
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    // roll mode: snap to target, CSS transitions do the rolling
    setAnimating(true);
    setDisplayValue(target);
    const timeout = setTimeout(() => setAnimating(false), duration + 150);
    return () => clearTimeout(timeout);
  }, [value, mode, duration]);

  const text = format(displayValue);
  const chars = text.split('');

  if (mode === 'count') {
    return <span className={`${className} tabular-nums`}>{text}</span>;
  }

  // Rightmost digit gets no stagger delay; each column to the left lags a beat.
  let digitIndexFromRight = -1;

  return (
    <span className={`inline-flex items-baseline tabular-nums ${className}`} aria-label={text}>
      {chars.map((ch, i) => {
        if (!/\d/.test(ch)) {
          return (
            <span key={i} className="inline-block whitespace-pre">
              {ch}
            </span>
          );
        }
        digitIndexFromRight++;
        const digit = parseInt(ch, 10);
        const stagger = digitIndexFromRight * 55;
        return (
          <span
            key={i}
            className="inline-block overflow-hidden"
            style={{ height: '1em', lineHeight: '1em' }}
          >
            <span
              className="flex flex-col"
              style={{
                transform: `translateY(-${digit}em)`,
                transition: animating
                  ? `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${stagger}ms`
                  : 'none',
              }}
            >
              {DIGITS.map(d => (
                <span key={d} style={{ height: '1em', lineHeight: '1em' }}>
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
};
