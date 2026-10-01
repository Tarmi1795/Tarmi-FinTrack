
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
  /** Per-character gold gradient — required inside parents using text-gold-gradient
   * (background-clip: text cannot paint through the digit strips' transforms). */
  gradient?: boolean;
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
 * Animates from zero on first mount, and from the previous value afterwards.
 */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  format = DEFAULT_FORMAT,
  mode = 'roll',
  duration = 900,
  gradient = false,
  className = '',
}) => {
  const prevValue = useRef<number | null>(null);
  const [displayValue, setDisplayValue] = useState<number>(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const target = value ?? 0;
    const first = prevValue.current === null;
    const from = prevValue.current ?? 0;
    prevValue.current = target;

    if (motionReduced() || from === target) {
      setDisplayValue(target);
      setAnimating(false);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const rafs: number[] = [];
    const cleanup = () => { timers.forEach(clearTimeout); rafs.forEach(cancelAnimationFrame); };

    if (mode === 'count') {
      setAnimating(true);
      const start = performance.now() + (first ? 60 : 0);
      const tick = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - start) / duration));
        setDisplayValue(from + (target - from) * easeOut(t));
        if (t < 1) rafs.push(requestAnimationFrame(tick));
        else { setDisplayValue(target); setAnimating(false); }
      };
      rafs.push(requestAnimationFrame(tick));
      return cleanup;
    }

    // roll mode
    setAnimating(true);
    if (first) {
      // Start the strips at zero, then roll to the target after paint
      setDisplayValue(0);
      timers.push(setTimeout(() => setDisplayValue(target), 60));
    } else {
      setDisplayValue(target);
    }
    timers.push(setTimeout(() => setAnimating(false), duration + 500));
    return cleanup;
  }, [value, mode, duration]);

  const text = format(displayValue);
  const chars = text.split('');
  const goldCls = gradient
    ? 'text-transparent bg-clip-text bg-gradient-to-b from-[#FFF176] via-[#D4AF37] to-[#A08020]'
    : '';

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
            <span key={i} className={`inline-block whitespace-pre ${goldCls}`}>
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
                <span key={d} style={{ height: '1em', lineHeight: '1em' }} className={goldCls}>
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
