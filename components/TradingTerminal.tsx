
import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, addWeeks, addYears, startOfYear, endOfYear,
  isSameDay, isAfter, isValid,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays, Table2, X, Loader2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useFinance } from '../context/FinanceContext';
import { AnimatedNumber } from './ui/AnimatedNumber';
import { Modal } from './ui/Modal';
import {
  TradingAccount, TradingCashflow, TradingSnapshot, TradingFxRate,
  TradingSettings,
} from '../types';

interface DayCell {
  date: string; // yyyy-MM-dd
  start: number;   // opening balance (scope currency units)
  pnl: number;
  close: number;
  flows: number;
  isInit: boolean;   // first recorded day of the scope
  hasEvents: boolean; // a snapshot or money movement happened this day
}

type Scope = 'portfolio' | string;
type Timeframe = 'week' | 'month' | 'year' | 'all';
type ViewMode = 'calendar' | 'table';
type DisplayMode = 'both' | 'roi' | 'pnl';

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Compact form for tight mobile tiles: -394.52 → -395, -39,083 → -39.1k, -2.4M
const fmtC = (n: number) => {
  const s = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1000) return `${s}${(a / 1000).toFixed(a >= 100000 ? 0 : 1)}k`;
  if (a >= 100) return `${s}${a.toFixed(0)}`;
  return `${s}${a.toFixed(2)}`;
};
const fmtQty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const r2 = (n: number) => Math.round(n * 100) / 100;
const dayKey = (d: Date | string) => format(typeof d === 'string' ? parseISO(d) : d, 'yyyy-MM-dd');
const roiOf = (pnl: number, base: number) => (base !== 0 ? (pnl / Math.abs(base)) * 100 : 0);
const pnlCls = (n: number) => (n > 0 ? 'text-emerald-400' : n < 0 ? 'text-rose-400' : 'text-gray-400');

const SESSIONS = ['London', 'New York', 'Tokyo', 'Sydney', 'Other'];

interface TradingTerminalProps {
  accounts: TradingAccount[];
  snapshots: TradingSnapshot[];
  cashflows: TradingCashflow[];
  settings: TradingSettings | null;
  fxRates: TradingFxRate[];
  baseCurrency: string;
  onUpdateTarget: (target: number) => Promise<void>;
}

export const TradingTerminal: React.FC<TradingTerminalProps> = ({
  accounts, snapshots, cashflows, settings, fxRates, baseCurrency,
  onUpdateTarget,
}) => {
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>('portfolio');
  const [timeframe, setTimeframe] = useState<Timeframe>('month');
  const [view, setView] = useState<ViewMode>('calendar');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('both');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [inspectorDate, setInspectorDate] = useState<string | null>(null);
  const [editingTarget, setEditingTarget] = useState(false);
  const [curveMode, setCurveMode] = useState<'balance' | 'growth'>('balance');
  const [targetDraft, setTargetDraft] = useState('');
  const [isSavingTarget, setIsSavingTarget] = useState(false);

  // --- FX conversion ---
  const rateMap = useMemo(() => {
    const m: Record<string, number> = { [baseCurrency]: 1 };
    fxRates.forEach(r => { m[r.currency] = r.rate_to_base; });
    return m;
  }, [fxRates, baseCurrency]);
  const rateFor = useCallback((currency: string) => (currency === baseCurrency ? 1 : rateMap[currency] ?? 1), [rateMap, baseCurrency]);

  // --- Per-account series: event-day cells + carried balance lookup ---
  // Event days = days with a snapshot or a money movement. The balance carries
  // forward across gap days, so "as of any date" lookups stay correct even when
  // an account stops pushing snapshots.
  const seriesByAccount = useMemo(() => {
    const out: Record<string, {
      events: Map<string, { pnl: number; flows: number; hasSnapshot: boolean; isInit: boolean }>;
      balances: Array<{ date: string; close: number }>;
      flowsByDate: Map<string, number>;
      firstDate: string | null;
    }> = {};
    for (const acc of accounts) {
      const snaps = snapshots.filter(s => s.account_id === acc.id)
        .sort((a, b) => a.snap_date.localeCompare(b.snap_date));
      const snapMap = new Map(snaps.map(s => [s.snap_date, s]));
      const flowsByDate = new Map<string, number>();
      cashflows.filter(f => f.account_id === acc.id).forEach(f => {
        flowsByDate.set(f.flow_date, (flowsByDate.get(f.flow_date) || 0) + (f.flow_type === 'deposit' ? Number(f.amount) : -Number(f.amount)));
      });
      const dates = Array.from(new Set([
        ...snaps.map(s => s.snap_date),
        ...flowsByDate.keys(),
      ])).sort();

      const events = new Map<string, { pnl: number; flows: number; hasSnapshot: boolean; isInit: boolean }>();
      const balances: Array<{ date: string; close: number }> = [];
      let prevClose: number | null = null;
      for (const d of dates) {
        const flowsD = r2(flowsByDate.get(d) || 0);
        const snap = snapMap.get(d);
        const isInit = prevClose === null;
        let close: number;
        let pnl = 0;
        if (snap) {
          close = Number(snap.balance);
          pnl = isInit ? r2(close - flowsD) : r2(close - prevClose - flowsD);
        } else {
          close = r2((prevClose ?? 0) + flowsD);
        }
        events.set(d, { pnl, flows: flowsD, hasSnapshot: !!snap, isInit });
        balances.push({ date: d, close });
        prevClose = close;
      }
      out[acc.id] = { events, balances, flowsByDate, firstDate: dates[0] || null };
    }
    return out;
  }, [accounts, snapshots, cashflows]);

  // --- Merged scope series (carry-forward: continuous from first to last event;
  // every account's balance is carried across gap days so the total value and
  // the curve stay correct even when a broker stops pushing snapshots) ---
  const mergedSeries = useMemo(() => {
    const inScope = accounts.filter(a => scope === 'portfolio' || a.id === scope);
    const dateSet = new Set<string>();
    inScope.forEach(acc => {
      seriesByAccount[acc.id]?.balances.forEach(b => dateSet.add(b.date));
    });
    const allDates = Array.from(dateSet).sort();
    const merged = new Map<string, DayCell>();
    if (allDates.length === 0) return merged;

    const idxs = new Map<string, number>(); // pointer into each account's balances
    inScope.forEach(acc => idxs.set(acc.id, -1));

    let prevTotal: number | null = null;
    for (const d of allDates) {
      let closeSum = 0, flowsSum = 0, pnlSum = 0, hasEvents = false;
      for (const acc of inScope) {
        const s = seriesByAccount[acc.id];
        if (!s) continue;
        let idx = idxs.get(acc.id)!;
        while (idx + 1 < s.balances.length && s.balances[idx + 1].date <= d) idx++;
        idxs.set(acc.id, idx);
        if (idx < 0) continue; // account not open yet
        const rate = rateFor(acc.currency);
        const asOfCur = s.balances[idx].close;
        const flowsAcc = r2(s.flowsByDate.get(d) || 0);
        const pnlAcc = idx === 0 ? r2(asOfCur - flowsAcc) : r2(asOfCur - s.balances[idx - 1].close - flowsAcc);
        closeSum += asOfCur * rate;
        flowsSum += flowsAcc * rate;
        pnlSum += pnlAcc * rate;
        if (s.events.get(d)?.hasSnapshot || flowsAcc !== 0) hasEvents = true;
      }
      const start = prevTotal === null ? r2(closeSum - pnlSum - flowsSum) : prevTotal;
      merged.set(d, {
        date: d,
        start,
        pnl: pnlSum,
        close: closeSum,
        flows: flowsSum,
        isInit: prevTotal === null,
        hasEvents,
      });
      prevTotal = closeSum;
    }
    return merged;
  }, [accounts, scope, seriesByAccount, rateFor]);

  // --- Scope capital: net deposits (Σ deposits − withdrawals, base currency) —
  // the same definition as the Total Capital summary card. Anchors all-time P&L.
  const scopeCapital = useMemo(() => {
    let cap = 0;
    for (const acc of accounts) {
      if (scope !== 'portfolio' && scope !== acc.id) continue;
      const net = cashflows
        .filter(f => f.account_id === acc.id)
        .reduce((s, f) => s + (f.flow_type === 'deposit' ? f.amount : -f.amount), 0);
      cap += net * rateFor(acc.currency);
    }
    return r2(cap);
  }, [accounts, cashflows, scope, rateFor]);

  // --- Range resolution ---
  const rangeDays = useMemo((): string[] => {
    const allDates = Array.from(mergedSeries.keys()).sort();
    if (timeframe === 'all') return allDates;
    const days: string[] = [];
    if (timeframe === 'month') {
      const s = startOfMonth(anchor), e = endOfMonth(anchor);
      for (let d = s; d <= e; d = addDays(d, 1)) days.push(dayKey(d));
    } else if (timeframe === 'week') {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      const e = endOfWeek(anchor, { weekStartsOn: 1 });
      for (let d = s; d <= e; d = addDays(d, 1)) days.push(dayKey(d));
    } else {
      const s = startOfYear(anchor), e = endOfYear(anchor);
      for (let d = s; d <= e; d = addDays(d, 1)) days.push(dayKey(d));
    }
    return days;
  }, [mergedSeries, timeframe, anchor]);

  const activeDays = useMemo(() =>
    rangeDays.filter(d => mergedSeries.get(d)?.hasEvents)
  , [rangeDays, mergedSeries]);

  // --- KPI values ---
  const allTime = useMemo(() => {
    const dates = Array.from(mergedSeries.keys()).sort();
    const current = dates.length ? mergedSeries.get(dates[dates.length - 1])!.close : 0;
    // Anchor P&L to net-deposits capital (same as the Total Capital card), not the
    // first recorded close — capital keeps counting deposits made after that day.
    const pnl = r2(current - scopeCapital);
    return { start: scopeCapital, current, pnl, roi: roiOf(pnl, scopeCapital) };
  }, [mergedSeries, scopeCapital]);

  const period = useMemo(() => {
    if (timeframe === 'all') {
      // All-time = balance today − total capital (user-confirmed definition)
      return { pnl: allTime.pnl, ret: allTime.roi, start: allTime.start };
    }
    if (activeDays.length === 0) return { pnl: 0, ret: 0, start: 0 };
    const first = mergedSeries.get(activeDays[0])!;
    const pnl = r2(activeDays.reduce((s, d) => s + mergedSeries.get(d)!.pnl, 0));
    // If the range covers the scope's entire history (e.g. Year 2026 for a
    // trader who started Sept 2026), the period must reconcile with the
    // capital-anchored all-time figure — measure ROI against capital, not the
    // (meaninglessly small) opening balance.
    const allDates = Array.from(mergedSeries.keys()).sort();
    const coversAllHistory = allDates.length > 0 && activeDays[0] <= allDates[0];
    const base = coversAllHistory && scopeCapital !== 0 ? scopeCapital : (first.start || first.close);
    return { pnl, ret: roiOf(pnl, base), start: base };
  }, [activeDays, mergedSeries, timeframe, allTime, scopeCapital]);

  const monthStats = useMemo(() => {
    const monthPrefix = format(anchor, 'yyyy-MM');
    const monthDays = Array.from(mergedSeries.entries())
      .filter(([d]) => d.startsWith(monthPrefix))
      .map(([, c]) => c);
    const wins = monthDays.filter(c => c.pnl > 0);
    const losses = monthDays.filter(c => c.pnl < 0);
    const pnl = r2(monthDays.reduce((s, c) => s + c.pnl, 0));
    const tradingDays = wins.length + losses.length;
    const target = settings?.monthly_profit_target || 0;
    return {
      pnl,
      wins: wins.length,
      losses: losses.length,
      tradingDays,
      winRate: tradingDays > 0 ? (wins.length / tradingDays) * 100 : 0,
      progress: target > 0 ? (pnl / target) * 100 : null,
      target,
    };
  }, [mergedSeries, anchor, settings]);

  // --- Calendar construction (Monday-first) ---
  const calendarCells = useMemo((): Array<{ key: string; date: Date | null }> => {
    if (timeframe === 'week') {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      const cells = [];
      for (let i = 0; i < 7; i++) cells.push({ key: dayKey(addDays(s, i)), date: addDays(s, i) });
      return cells;
    }
    if (timeframe !== 'month') return [];
    const first = startOfMonth(anchor);
    const lead = (first.getDay() + 6) % 7; // Monday-first offset
    const cells: Array<{ key: string; date: Date | null }> = [];
    for (let i = 0; i < lead; i++) cells.push({ key: `lead-${i}`, date: null });
    const daysInMonth = endOfMonth(anchor).getDate();
    for (let i = 1; i <= daysInMonth; i++) cells.push({ key: `d-${i}`, date: new Date(anchor.getFullYear(), anchor.getMonth(), i) });
    return cells;
  }, [timeframe, anchor]);

  // --- Navigation ---
  const stepAnchor = (dir: 1 | -1) => {
    if (timeframe === 'month') setAnchor(a => addMonths(a, dir));
    else if (timeframe === 'week') setAnchor(a => addWeeks(a, dir));
    else if (timeframe === 'year') setAnchor(a => addYears(a, dir));
  };
  const canStepForward = useMemo(() => {
    if (timeframe === 'all') return false;
    const end = timeframe === 'month' ? endOfMonth(anchor)
      : timeframe === 'week' ? endOfWeek(anchor, { weekStartsOn: 1 })
      : endOfYear(anchor);
    return isValid(end) && end.getTime() < Date.now();
  }, [timeframe, anchor]);

  const rangeLabel = useMemo(() => {
    if (timeframe === 'all') return 'All-time';
    if (timeframe === 'month') return format(anchor, 'MMMM yyyy');
    if (timeframe === 'week') {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      return `${format(s, 'dd MMM')} — ${format(endOfWeek(s, { weekStartsOn: 1 }), 'dd MMM yyyy')}`;
    }
    return format(anchor, 'yyyy');
  }, [timeframe, anchor]);

  // --- Curve data (full history, all recorded days) ---
  const curveData = useMemo(() => {
    const rows = Array.from(mergedSeries.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, c]) => ({ date, balance: c.close, pnl: c.pnl, start: c.start }));

    if (curveMode === 'balance') {
      return rows.map(r => ({ date: r.date, balance: r.balance }));
    }

    // Growth curve: pure trading performance anchored to total capital.
    // capital → (capital + total trading P&L) = current actual balance.
    // Losses that predate daily tracking are pro-rated evenly across the
    // recorded days, so the line reconciles to today's balance and every
    // deposit/withdrawal stays out of the trading outcome.
    const capital = scopeCapital;
    const last = rows[rows.length - 1];
    const totalPnL = r2(last.balance - capital);
    const recordedPnL = r2(rows.reduce((s, r) => s + r.pnl, 0));
    const backPnL = r2(totalPnL - recordedPnL); // pre-tracking losses/gains, spread per day
    const perDay = rows.length > 0 ? backPnL / rows.length : 0;

    let value = capital;
    return rows.map(r => {
      value = r2(value + r.pnl + perDay);
      return { date: r.date, balance: value };
    });
  }, [mergedSeries, curveMode, scopeCapital, cashflows]);

  // --- Inspector ---
  const inspectorCell = inspectorDate ? mergedSeries.get(inspectorDate) : null;
  const scopeAccountIds = useMemo(() => (
    scope === 'portfolio' ? accounts.map(a => a.id) : [scope]
  ), [scope, accounts]);
  const scopeAccounts = useMemo(() => (
    scope === 'portfolio'
      ? accounts.filter(a => a.is_active !== false).map(a => ({ id: a.id, label: a.name, subLabel: a.currency }))
      : []
  ), [scope, accounts]);

  const inspectorFlows = useMemo(() => {
    if (!inspectorDate) return [];
    return cashflows.filter(f =>
      f.flow_date === inspectorDate && scopeAccountIds.includes(f.account_id));
  }, [cashflows, inspectorDate, scopeAccountIds]);

  // --- Per-broker P&L breakdown for the Day Journal ---
  // Day Δ = snapshot(day) − snapshot(previous existing snapshot), in the
  // account's native currency and converted to base. Deposits/withdrawals are
  // never part of these deltas — they are listed separately as money movements.
  interface BreakdownRow {
    id: string; name: string; currency: string;
    eod: number | null; prev: number | null;
    deltaNative: number | null; deltaBase: number | null;
    share: number | null; isNew: boolean;
  }
  const dayBreakdown = useMemo(() => {
    if (!inspectorDate) return null;
    const inScope = accounts.filter(a =>
      a.is_active !== false && (scope === 'portfolio' || a.id === scope));
    const rows: BreakdownRow[] = [];
    for (const acc of inScope) {
      const snaps = snapshots.filter(s => s.account_id === acc.id)
        .sort((x, y) => x.snap_date.localeCompare(y.snap_date));
      if (snaps.length === 0) continue;
      const eodSnap = snaps.find(s => s.snap_date === inspectorDate) || null;
      const prevSnap = snaps.filter(s => s.snap_date < inspectorDate).pop() || null;
      const rate = rateFor(acc.currency);
      if (!eodSnap) {
        rows.push({ id: acc.id, name: acc.name, currency: acc.currency, eod: null, prev: prevSnap ? Number(prevSnap.balance) : null, deltaNative: null, deltaBase: null, share: null, isNew: false });
        continue;
      }
      const eod = Number(eodSnap.balance);
      if (!prevSnap) {
        // first snapshot ever — no baseline to measure against
        rows.push({ id: acc.id, name: acc.name, currency: acc.currency, eod, prev: null, deltaNative: null, deltaBase: null, share: null, isNew: true });
        continue;
      }
      const deltaNative = r2(eod - Number(prevSnap.balance));
      const deltaBase = r2(deltaNative * rate);
      rows.push({ id: acc.id, name: acc.name, currency: acc.currency, eod, prev: Number(prevSnap.balance), deltaNative, deltaBase, share: null, isNew: false });
    }
    const totalDelta = r2(rows.reduce((s, r) => s + (r.deltaBase ?? 0), 0));
    rows.forEach(r => {
      r.share = r.deltaBase !== null && Math.abs(totalDelta) > 0
        ? r2((r.deltaBase / Math.abs(totalDelta)) * 100)
        : null;
    });
    rows.sort((a, b) => Math.abs(b.deltaBase ?? 0) - Math.abs(a.deltaBase ?? 0));
    return { rows, totalDelta };
  }, [inspectorDate, accounts, snapshots, scope, rateFor]);

  // --- Render helpers ---
  const scopeCurrency = scope === 'portfolio' ? baseCurrency : accounts.find(a => a.id === scope)?.currency || baseCurrency;
  const scopeLabel = scope === 'portfolio' ? 'Portfolio' : accounts.find(a => a.id === scope)?.name || '';

  const periodPnlBlock = (cls: string) => {
    const showPnl = displayMode !== 'roi';
    const showRoi = displayMode !== 'pnl';
    return (
      <div className={`font-mono ${cls}`}>
        {showPnl && (
          <div className={pnlCls(period.pnl)}>
            {period.pnl > 0 ? '+' : ''}{fmt(period.pnl)}
          </div>
        )}
        {showRoi && (
          <div className={pnlCls(period.pnl) + (showPnl ? ' text-xs mt-1' : ' text-lg')}>
            {period.ret >= 0 ? '+' : ''}{period.ret.toFixed(2)}%
          </div>
        )}
      </div>
    );
  };

  const dayTile = (date: Date | null, key: string) => {
    if (!date) return <div key={key} className="min-h-[74px] rounded-md border border-transparent" />;
    const dk = dayKey(date);
    const cell = mergedSeries.get(dk);
    const isToday = isSameDay(date, new Date());
    const isInit = cell?.isInit;
    const hasData = !!cell && cell.hasEvents;
    const pos = (cell?.pnl || 0) > 0;
    const neg = (cell?.pnl || 0) < 0;
    return (
      <button
        key={key}
        onClick={() => hasData && setInspectorDate(dk)}
        disabled={!hasData}
        className={`relative min-h-[62px] p-1.5 sm:min-h-[74px] sm:p-2 rounded-md border text-left transition-all ${
          hasData
            ? pos ? 'border-emerald-500/30 bg-emerald-500/[0.05] hover:border-emerald-400/60'
              : neg ? 'border-rose-500/30 bg-rose-500/[0.05] hover:border-rose-400/60'
                : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
            : 'border-transparent bg-slate-900/20 opacity-30 cursor-default'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className={`text-[10px] sm:text-[11px] font-mono ${isToday ? 'text-gold-300 font-bold' : 'text-slate-400'}`}>
            {format(date, 'd')}
          </span>
          <div className="flex gap-1">
            {isInit && <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-gold-500/15 text-gold-400 border border-gold-500/30">Init</span>}
            {isToday && <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-slate-700 text-white">Today</span>}
          </div>
        </div>
        {hasData && (
          <div className="mt-1 sm:mt-1.5 font-mono">
            {displayMode === 'roi' ? (
              // ROI-emphasized: big %, but the P&L amount is always shown too
              <>
                <div className={`text-xs sm:text-sm font-bold ${pnlCls(cell.pnl)}`}>
                  {roiOf(cell.pnl, cell.start) >= 0 ? '+' : ''}{roiOf(cell.pnl, cell.start).toFixed(2)}%
                </div>
                <div className={`text-[9px] sm:text-[10px] ${pnlCls(cell.pnl)} opacity-80`}>
                  <span className="sm:hidden">{cell.pnl > 0 ? '+' : ''}{fmtC(cell.pnl)}</span>
                  <span className="hidden sm:inline">{cell.pnl > 0 ? '+' : ''}{fmt(cell.pnl)}</span>
                </div>
              </>
            ) : (
              <>
                <div className={`text-[10px] sm:text-xs font-bold ${pnlCls(cell.pnl)}`}>
                  <span className="sm:hidden">{cell.pnl > 0 ? '+' : ''}{fmtC(cell.pnl)}</span>
                  <span className="hidden sm:inline">{cell.pnl > 0 ? '+' : ''}{fmt(cell.pnl)}</span>
                </div>
                {displayMode !== 'pnl' && (
                  <div className={`text-[9px] sm:text-[10px] ${pnlCls(cell.pnl)} opacity-80`}>
                    {roiOf(cell.pnl, cell.start) >= 0 ? '+' : ''}{roiOf(cell.pnl, cell.start).toFixed(2)}%
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </button>
    );
  };

  const tableRow = (dk: string) => {
    const c = mergedSeries.get(dk)!;
    return (
      <tr
        key={dk}
        onClick={() => setInspectorDate(dk)}
        className="cursor-pointer border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors"
      >
        <td className="px-3 py-2.5 text-xs font-mono text-slate-300">{format(parseISO(dk), 'dd MMM yyyy')}</td>
        <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-400 tabular-nums">{fmt(c.start)}</td>
        <td className={`px-3 py-2.5 text-right font-mono text-xs font-bold tabular-nums ${pnlCls(c.pnl)}`}>
          {c.pnl > 0 ? '+' : ''}{fmt(c.pnl)}
        </td>
        <td className={`px-3 py-2.5 text-right font-mono text-xs tabular-nums ${pnlCls(c.pnl)}`}>
          {roiOf(c.pnl, c.start) >= 0 ? '+' : ''}{roiOf(c.pnl, c.start).toFixed(2)}%
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-200 tabular-nums">{fmt(c.close)}</td>
      </tr>
    );
  };

  const segBtn = (active: boolean) =>
    `px-2 py-2 sm:px-2.5 sm:py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
      active ? 'bg-slate-700/80 text-white' : 'text-slate-500 hover:text-slate-300'
    }`;

  const kpiLabel = 'text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500';

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 overflow-hidden">
      {/* ===== KPI banner — swipe carousel on mobile, 3-col grid on md+ ===== */}
      <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory md:grid md:grid-cols-3 border-b border-slate-800/80 divide-x divide-slate-800/80">
        {/* Initial investment */}
        <div className="snap-start shrink-0 w-[82%] sm:w-[52%] md:w-auto p-4 md:p-5">
          <p className={kpiLabel}>Initial investment</p>
          <div className="flex items-baseline gap-2 mt-2 flex-wrap">
            <AnimatedNumber
              value={allTime.start}
              format={v => `${scopeCurrency} ${fmt(v)}`}
              className="text-lg sm:text-xl md:text-2xl font-bold text-white"
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-500 font-mono">
              Balance: <span className="text-slate-300 font-bold">{fmt(allTime.current)}</span>
            </span>
            <span className={`font-mono font-bold px-2 py-0.5 rounded-md text-[11px] border ${
              allTime.roi >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}>
              {allTime.roi >= 0 ? '+' : ''}{allTime.roi.toFixed(2)}% Net ROI
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-500 font-mono">All-time P&amp;L</span>
            <span className={`font-mono font-bold ${pnlCls(allTime.pnl)}`}>
              {allTime.pnl > 0 ? '+' : ''}{fmt(allTime.pnl)}
            </span>
          </div>
          <p className="text-[10px] text-slate-600 mt-1.5">All-time · capital = net deposits</p>
        </div>

        {/* Period P&L */}
        <div className="snap-start shrink-0 w-[82%] sm:w-[52%] md:w-auto p-4 md:p-5">
          <div className="flex items-center justify-between">
            <p className={kpiLabel}>Period P&amp;L</p>
            <span className="text-[10px] font-mono text-slate-500">{rangeLabel}</span>
          </div>
          <div className="mt-2 text-lg sm:text-xl md:text-2xl font-bold">
            {periodPnlBlock('')}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-mono">
              {activeDays.length} recorded days
            </span>
            <span className={`font-mono font-bold px-2 py-0.5 rounded-md text-[11px] border ${
              period.ret >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
            }`}>
              {period.ret >= 0 ? '+' : ''}{period.ret.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Monthly target & consistency */}
        <div className="snap-start shrink-0 w-[82%] sm:w-[52%] md:w-auto p-4 md:p-5">
          <div className="flex items-center justify-between">
            <p className={kpiLabel}>Monthly target &amp; consistency</p>
            <button
              onClick={() => { setTargetDraft(String(settings?.monthly_profit_target || 0)); setEditingTarget(true); }}
              className="text-[10px] text-slate-500 hover:text-gold-400 transition-colors"
              aria-label="Edit monthly target"
            >
              {editingTarget ? null : 'edit'}
            </button>
          </div>
          {editingTarget ? (
            <div className="mt-2 flex gap-2">
              <input
                value={targetDraft}
                onChange={(e) => setTargetDraft(e.target.value)}
                inputMode="decimal"
                className="w-28 bg-gray-900/70 border border-gray-700 rounded-md px-2 py-1.5 text-xs font-mono text-white outline-none focus:border-gold-500"
                autoFocus
              />
              <button
                onClick={async () => {
                  const v = Number(targetDraft);
                  if (!isNaN(v) && v >= 0) { setIsSavingTarget(true); await onUpdateTarget(v); }
                  setEditingTarget(false); setIsSavingTarget(false);
                }}
                disabled={isSavingTarget}
                className="px-2.5 py-1.5 bg-gold-500 text-black rounded-md text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-50"
              >
                {isSavingTarget ? <Loader2 size={11} className="animate-spin" /> : 'Set'}
              </button>
              <button onClick={() => setEditingTarget(false)} className="text-slate-500 hover:text-white"><X size={13} /></button>
            </div>
          ) : (
            <p className="text-[10px] text-slate-600 mt-1.5">
              Target: <span className="text-slate-400 font-mono">{fmt(monthStats.target)} {baseCurrency}</span> / month
            </p>
          )}
          <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-xs">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-600">Win rate</p>
              <p className="text-white font-bold">{monthStats.winRate.toFixed(0)}%</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-600">Win / Loss</p>
              <p className="font-bold">
                <span className="text-emerald-400">{monthStats.wins}</span>
                <span className="text-slate-600"> / </span>
                <span className="text-rose-400">{monthStats.losses}</span>
              </p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-600">Month P&amp;L</p>
              <p className={`font-bold ${pnlCls(monthStats.pnl)}`}>
                {monthStats.pnl > 0 ? '+' : ''}{fmt(monthStats.pnl)}
              </p>
            </div>
          </div>
          {monthStats.progress !== null && (
            <div className="mt-2.5">
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${monthStats.progress >= 100 ? 'bg-emerald-400' : 'bg-gold-500'}`}
                  style={{ width: `${Math.min(100, Math.max(0, monthStats.progress))}%` }}
                />
              </div>
              <p className={`text-[10px] mt-1 font-mono ${monthStats.progress >= 100 ? 'text-emerald-400' : 'text-slate-500'}`}>
                {monthStats.progress >= 100
                  ? `Target reached — ${monthStats.progress.toFixed(0)}%`
                  : `${monthStats.progress.toFixed(0)}% of monthly target`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ===== Controls — two swipeable rows on mobile ===== */}
      <div className="px-2 sm:px-4 py-2 sm:py-3 border-b border-slate-800/80 bg-slate-950/40 space-y-2">
        {/* Account scope pills */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
          <button
            onClick={() => setScope('portfolio')}
            className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-colors whitespace-nowrap ${
              scope === 'portfolio' ? 'bg-slate-700/80 border-slate-600 text-white' : 'border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
          >
            Portfolio
          </button>
          {accounts.filter(a => a.is_active !== false).map(a => (
            <button
              key={a.id}
              onClick={() => setScope(a.id)}
              className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-colors whitespace-nowrap ${
                scope === a.id ? 'bg-slate-700/80 border-slate-600 text-white' : 'border-slate-800 text-slate-500 hover:text-slate-300'
              }`}
              title={a.is_active === false ? 'Archived' : undefined}
            >
              {a.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar md:ml-auto md:flex-wrap md:justify-end md:overflow-visible">
          {/* Timeframe */}
          <div className="flex shrink-0 bg-slate-900 border border-slate-800 rounded-md p-0.5">
            {(['week', 'month', 'year', 'all'] as Timeframe[]).map(tf => (
              <button
                key={tf}
                onClick={() => { setTimeframe(tf); if (tf !== 'month' && tf !== 'week') setView('table'); else setView(v => (v === 'table' ? 'calendar' : v)); }}
                className={segBtn(timeframe === tf)}
              >
                {tf === 'all' ? 'All' : tf.charAt(0).toUpperCase() + tf.slice(1)}
              </button>
            ))}
          </div>

          {/* Month / week stepper */}
          {timeframe !== 'all' && (
            <div className="flex shrink-0 items-center gap-1 bg-slate-900 border border-slate-800 rounded-md px-1">
              <button onClick={() => stepAnchor(-1)} className="p-1.5 text-slate-400 hover:text-white rounded active:scale-90 transition-transform" aria-label="Previous">
                <ChevronLeft size={14} />
              </button>
              <span className="font-mono text-[11px] font-bold text-slate-200 min-w-[96px] text-center">
                {timeframe === 'week'
                  ? `${format(startOfWeek(anchor, { weekStartsOn: 1 }), 'dd MMM')} – ${format(endOfWeek(anchor, { weekStartsOn: 1 }), 'dd MMM')}`
                  : format(anchor, 'MMM yyyy')}
              </span>
              <button
                onClick={() => stepAnchor(1)}
                disabled={!canStepForward}
                className="p-1.5 text-slate-400 hover:text-white rounded active:scale-90 transition-transform disabled:opacity-30"
                aria-label="Next"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* View toggle (calendar only exists for month/week) */}
          {(timeframe === 'month' || timeframe === 'week') && (
            <div className="flex shrink-0 bg-slate-900 border border-slate-800 rounded-md p-0.5">
              <button onClick={() => setView('calendar')} className={`p-1.5 rounded ${view === 'calendar' ? segBtn(true) : 'text-slate-500 hover:text-slate-300'}`} aria-label="Calendar view">
                <CalendarDays size={13} />
              </button>
              <button onClick={() => setView('table')} className={`p-1.5 rounded ${view === 'table' ? segBtn(true) : 'text-slate-500 hover:text-slate-300'}`} aria-label="Table view">
                <Table2 size={13} />
              </button>
            </div>
          )}

          {/* Display mode */}
          <div className="flex shrink-0 bg-slate-900 border border-slate-800 rounded-md p-0.5">
            {([['both', 'P&L + ROI'], ['roi', 'ROI'], ['pnl', 'P&L']] as Array<[DisplayMode, string]>).map(([m, label]) => (
              <button key={m} onClick={() => setDisplayMode(m)} className={segBtn(displayMode === m)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Body ===== */}
      <div className="p-3 md:p-4">
        {(timeframe === 'month' || timeframe === 'week') && view === 'calendar' ? (
          <>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1 sm:mb-1.5">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                <div key={d} className="text-center text-[9px] font-bold uppercase tracking-widest text-slate-600 py-1">
                  <span className="sm:hidden">{d[0]}</span>
                  <span className="hidden sm:inline">{d}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {calendarCells.map(c => dayTile(c.date, c.key))}
            </div>
          </>
        ) : (
          <div className="border border-slate-800/80 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[560px]">
                <thead>
                  <tr className="bg-slate-900/80 border-b border-slate-800 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5 text-right">Start balance</th>
                    <th className="px-3 py-2.5 text-right">Day P&amp;L</th>
                    <th className="px-3 py-2.5 text-right">Day ROI</th>
                    <th className="px-3 py-2.5 text-right">Closing balance</th>
                  </tr>
                </thead>
                <tbody>
                  {rangeDays.filter(d => mergedSeries.get(d)?.hasEvents).map(dk => tableRow(dk))}
                  {rangeDays.filter(d => mergedSeries.get(d)?.hasEvents).length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-xs text-slate-600">No recorded activity in this range.</td></tr>
                  )}
                </tbody>
                {activeDays.length > 0 && (() => {
                  const first = mergedSeries.get(activeDays[0])!;
                  const last = mergedSeries.get(activeDays[activeDays.length - 1])!;
                  return (
                    <tfoot>
                      <tr className="bg-slate-900/90 border-t border-slate-700 font-bold">
                        <td className="px-3 py-2.5 text-[10px] uppercase tracking-widest text-slate-400">Period total</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-400 tabular-nums">{fmt(first.start)}</td>
                        <td className={`px-3 py-2.5 text-right font-mono text-xs tabular-nums ${pnlCls(period.pnl)}`}>
                          {period.pnl > 0 ? '+' : ''}{fmt(period.pnl)}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-mono text-xs tabular-nums ${pnlCls(period.pnl)}`}>
                          {period.ret >= 0 ? '+' : ''}{period.ret.toFixed(2)}%
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs text-white tabular-nums">{fmt(last.close)}</td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ===== Balance curve — full history ===== */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 md:p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex bg-slate-900 border border-slate-800 rounded-md p-0.5">
            {([['balance', 'Balance'], ['growth', 'Growth']] as Array<['balance' | 'growth', string]>).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setCurveMode(m)}
                className={`px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  curveMode === m ? 'bg-slate-700/80 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-[10px] font-mono text-slate-600">{scopeCurrency} · full history</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={curveData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#D4AF37" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => format(parseISO(d), 'dd MMM yy')}
              tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
              minTickGap={28}
              axisLine={{ stroke: '#27272a' }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => fmtC(v)}
              tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
              width={56}
              axisLine={false}
              tickLine={false}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}
              labelStyle={{ color: '#D4AF37' }}
              formatter={(v: number) => [`${scopeCurrency} ${fmt(v)}`, curveMode === 'growth' ? 'Growth' : 'Balance']}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="#D4AF37"
              strokeWidth={2}
              fill="url(#balFill)"
              dot={false}
              activeDot={{ r: 4, fill: '#D4AF37', stroke: '#12100d' }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-slate-600 mt-1">
          Daily closing balance from the first recorded day — your MT5 agent keeps extending it into the future.
        </p>
      </div>

      {/* ===== Day Journal ===== */}
      <Modal isOpen={!!inspectorDate} onClose={() => setInspectorDate(null)} title={`Day Journal — ${inspectorDate ? format(parseISO(inspectorDate), 'EEEE, dd MMM yyyy') : ''}`} wide>
        {inspectorDate && inspectorCell && (
          <div className="space-y-4">
            {/* Day summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
              {[
                { label: 'Start balance', value: fmt(inspectorCell.start), cls: 'text-slate-300' },
                { label: 'Deposit / WD', value: inspectorCell.flows === 0 ? '—' : (inspectorCell.flows > 0 ? '+' : '−') + fmt(Math.abs(inspectorCell.flows)), cls: inspectorCell.flows > 0 ? 'text-sky-400' : inspectorCell.flows < 0 ? 'text-amber-400' : 'text-slate-400' },
                { label: 'Day P&L', value: (inspectorCell.pnl > 0 ? '+' : '') + fmt(inspectorCell.pnl), cls: pnlCls(inspectorCell.pnl) },
                { label: 'Close balance', value: fmt(inspectorCell.close), cls: 'text-slate-200' },
              ].map(s => (
                <div key={s.label} className="bg-gray-900/70 border border-gray-800 rounded-lg p-2.5">
                  <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold">{s.label}</p>
                  <p className={`mt-0.5 font-bold ${s.cls}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* P&L breakdown by broker */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">P&amp;L breakdown by broker</p>
              {(!dayBreakdown || dayBreakdown.rows.every(r => r.eod === null)) ? (
                <p className="text-xs text-slate-600 border border-dashed border-slate-800 rounded-lg py-5 text-center">
                  No snapshot data for this day.
                </p>
              ) : (
                <div className="border border-gray-800 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[640px]">
                      <thead>
                        <tr className="bg-gray-900/80 border-b border-gray-800 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                          <th className="px-3 py-2">Account</th>
                          <th className="px-3 py-2">Currency</th>
                          <th className="px-3 py-2 text-right">Snapshot (EOD)</th>
                          <th className="px-3 py-2 text-right">Prev day snapshot</th>
                          <th className="px-3 py-2 text-right">Day Δ (native)</th>
                          <th className="px-3 py-2 text-right">Day Δ ({baseCurrency})</th>
                          <th className="px-3 py-2 text-right">Share of move</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayBreakdown.rows.map(r => (
                          <tr key={r.id} className="border-b border-gray-800/60">
                            <td className="px-3 py-2 text-xs text-slate-200 font-medium">{r.name}</td>
                            <td className="px-3 py-2 text-xs font-mono text-slate-500">{r.currency}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs text-slate-200 tabular-nums">{r.eod === null ? '—' : fmt(r.eod)}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                              {r.isNew ? (
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-gold-500/15 text-gold-400 border border-gold-500/30">new</span>
                              ) : r.prev === null ? '—' : <span className="text-slate-400">{fmt(r.prev)}</span>}
                            </td>
                            <td className={`px-3 py-2 text-right font-mono text-xs tabular-nums ${r.deltaNative === null ? 'text-slate-500' : pnlCls(r.deltaNative)}`}>
                              {r.isNew ? 'new' : r.deltaNative === null ? '—' : (r.deltaNative > 0 ? '+' : '') + fmt(r.deltaNative)}
                            </td>
                            <td className={`px-3 py-2 text-right font-mono text-xs font-bold tabular-nums ${r.deltaBase === null ? 'text-slate-500' : pnlCls(r.deltaBase)}`}>
                              {r.isNew ? 'new' : r.deltaBase === null ? '—' : (r.deltaBase > 0 ? '+' : '') + fmt(r.deltaBase)}
                            </td>
                            <td className={`px-3 py-2 text-right font-mono text-xs tabular-nums ${r.share === null ? 'text-slate-500' : pnlCls(r.share)}`}>
                              {r.share === null ? '—' : (r.share > 0 ? '+' : '') + r.share.toFixed(1) + '%'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-900/90 border-t border-gray-700 font-bold">
                          <td className="px-3 py-2 text-[10px] uppercase tracking-widest text-slate-400" colSpan={5}>Total day move</td>
                          <td className={`px-3 py-2 text-right font-mono text-xs tabular-nums ${pnlCls(dayBreakdown.totalDelta)}`}>
                            {dayBreakdown.totalDelta > 0 ? '+' : ''}{fmt(dayBreakdown.totalDelta)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-slate-600">—</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Money movements — never mixed into the P&L deltas above */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Money movements</p>
              {inspectorFlows.length === 0 ? (
                <p className="text-xs text-slate-600 border border-dashed border-slate-800 rounded-lg py-5 text-center">
                  No money movements on this day.
                </p>
              ) : (
                <div className="space-y-2">
                  {inspectorFlows.map(f => {
                    const acc = accounts.find(a => a.id === f.account_id);
                    return (
                      <div key={f.id} className="bg-gray-900/70 border border-gray-800 rounded-lg p-3 flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            f.flow_type === 'deposit' ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                              : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          }`}>
                            {f.flow_type}
                          </span>
                          {acc && scope === 'portfolio' && (
                            <span className="text-[10px] text-slate-600">{acc.name}</span>
                          )}
                          {f.note && <span className="text-[11px] text-slate-500 truncate">{f.note}</span>}
                        </div>
                        <span className={`font-mono text-sm font-bold shrink-0 ${f.flow_type === 'deposit' ? 'text-sky-400' : 'text-amber-400'}`}>
                          {f.flow_type === 'deposit' ? '+' : '−'}{fmt(f.amount)} {acc?.currency || baseCurrency}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-[10px] text-slate-600">
              Day P&amp;L is computed from balance changes excluding deposits/withdrawals — deposits never inflate profit.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};

// Small helper: label class used inside the modal
const labelCls = 'block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5';
const inputCls = 'w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 outline-none transition-colors';
