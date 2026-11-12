
import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, addWeeks, addYears, startOfYear, endOfYear,
  isSameDay, isAfter, isValid,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays, Table2, Trash2, Plus, Loader2, X, TrendingUp } from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { AnimatedNumber } from './ui/AnimatedNumber';
import { Modal } from './ui/Modal';
import { SearchableSelect } from './ui/SearchableSelect';
import { confirmDialog } from './ui/ConfirmDialog';
import {
  TradingAccount, TradingCashflow, TradingSnapshot, TradingFxRate,
  TradingSettings, TradingTrade,
} from '../types';

interface DayCell {
  date: string; // yyyy-MM-dd
  start: number;   // opening balance (scope currency units)
  pnl: number;
  close: number;
  flows: number;
  tradeCount: number;
  isInit: boolean;
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
  trades: TradingTrade[] | null; // null = trading_trades table not migrated yet
  settings: TradingSettings | null;
  fxRates: TradingFxRate[];
  baseCurrency: string;
  onAddTrade: (trade: Omit<TradingTrade, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  onDeleteTrade: (id: string) => Promise<void>;
  onUpdateTarget: (target: number) => Promise<void>;
  onChanged: () => void;
}

export const TradingTerminal: React.FC<TradingTerminalProps> = ({
  accounts, snapshots, cashflows, trades, settings, fxRates, baseCurrency,
  onAddTrade, onDeleteTrade, onUpdateTarget, onChanged,
}) => {
  const navigate = useNavigate();
  const { user } = useFinance();
  const [scope, setScope] = useState<Scope>('portfolio');
  const [timeframe, setTimeframe] = useState<Timeframe>('month');
  const [view, setView] = useState<ViewMode>('calendar');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('both');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [inspectorDate, setInspectorDate] = useState<string | null>(null);
  const [showAddTrade, setShowAddTrade] = useState(false);
  const [savingTrade, setSavingTrade] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetDraft, setTargetDraft] = useState('');
  const [isSavingTarget, setIsSavingTarget] = useState(false);

  // --- FX conversion ---
  const rateMap = useMemo(() => {
    const m: Record<string, number> = { [baseCurrency]: 1 };
    fxRates.forEach(r => { m[r.currency] = r.rate_to_base; });
    return m;
  }, [fxRates, baseCurrency]);
  const rateFor = useCallback((currency: string) => (currency === baseCurrency ? 1 : rateMap[currency] ?? 1), [rateMap, baseCurrency]);

  // --- Per-account daily series ---
  const seriesByAccount = useMemo(() => {
    const out: Record<string, Map<string, DayCell>> = {};
    for (const acc of accounts) {
      const rate = rateFor(acc.currency);
      const snaps = snapshots.filter(s => s.account_id === acc.id)
        .sort((a, b) => a.snap_date.localeCompare(b.snap_date));
      const snapMap = new Map(snaps.map(s => [s.snap_date, s]));
      const flowsByDate = new Map<string, number>();
      cashflows.filter(f => f.account_id === acc.id).forEach(f => {
        flowsByDate.set(f.flow_date, (flowsByDate.get(f.flow_date) || 0) + (f.flow_type === 'deposit' ? f.amount : -f.amount));
      });
      const tradesFor = trades || [];
      const tradesByDate = new Map<string, { count: number; pnl: number; trades: TradingTrade[] }>();
      tradesFor.filter(t => t.account_id === acc.id).forEach(t => {
        const cur = tradesByDate.get(t.trade_date) || { count: 0, pnl: 0, trades: [] };
        cur.count += 1;
        cur.pnl += t.profit_loss;
        cur.trades.push(t);
        tradesByDate.set(t.trade_date, cur);
      });

      const dates = Array.from(new Set([
        ...snaps.map(s => s.snap_date),
        ...flowsByDate.keys(),
        ...tradesByDate.keys(),
      ])).sort();

      const series = new Map<string, DayCell>();
      let prevClose: number | null = null;
      for (const d of dates) {
        const flowsD = r2(flowsByDate.get(d) || 0);
        const snap = snapMap.get(d);
        const tinfo = tradesByDate.get(d);
        const isInit = prevClose === null;
        let close: number;
        let pnl: number;
        if (snap) {
          close = Number(snap.balance);
          if (isInit) {
            // Opening day: the gap between the first recorded balance and the
            // deposits made up to that day is real trading history — count it,
            // so the day-sum telescopes to (balance − capital) over any range
            // that covers the account's full history.
            pnl = r2(close - flowsD);
          } else {
            pnl = tinfo ? tinfo.pnl : r2(close - prevClose - flowsD);
          }
        } else {
          pnl = tinfo ? tinfo.pnl : 0;
          close = r2((prevClose ?? 0) + flowsD + pnl);
        }
        const start = isInit ? close : prevClose;
        series.set(d, {
          date: d,
          start: r2(start ?? 0),
          pnl: r2(pnl),
          close: r2(close),
          flows: flowsD,
          tradeCount: tinfo?.count || 0,
          isInit,
        });
        prevClose = close;
      }
      out[acc.id] = series;
    }
    return out;
  }, [accounts, snapshots, cashflows, trades, rateFor]);

  // --- Merged scope series (converted to base currency) ---
  const mergedSeries = useMemo(() => {
    const merged = new Map<string, DayCell>();
    for (const acc of accounts) {
      if (scope !== 'portfolio' && scope !== acc.id) continue;
      const rate = rateFor(acc.currency);
      seriesByAccount[acc.id]?.forEach((cell, d) => {
        const cur = merged.get(d);
        if (cur) {
          cur.start = r2(cur.start + cell.start * rate);
          cur.pnl = r2(cur.pnl + cell.pnl * rate);
          cur.close = r2(cur.close + cell.close * rate);
          cur.flows = r2(cur.flows + cell.flows * rate);
          cur.tradeCount += cell.tradeCount;
        } else {
          merged.set(d, {
            date: d,
            start: r2(cell.start * rate),
            pnl: r2(cell.pnl * rate),
            close: r2(cell.close * rate),
            flows: r2(cell.flows * rate),
            tradeCount: cell.tradeCount,
            isInit: cell.isInit,
          });
        }
      });
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
    rangeDays.filter(d => mergedSeries.has(d) && mergedSeries.get(d)!)
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

  // --- Inspector ---
  const inspectorCell = inspectorDate ? mergedSeries.get(inspectorDate) : null;
  const scopeAccounts = useMemo(() => (
    scope === 'portfolio'
      ? accounts.filter(a => a.is_active !== false).map(a => ({ id: a.id, label: a.name, subLabel: a.currency }))
      : []
  ), [scope, accounts]);
  const inspectorTrades = useMemo(() => {
    if (!trades || !inspectorDate) return [];
    return trades.filter(t =>
      t.trade_date === inspectorDate && (scope === 'portfolio' || t.account_id === scope));
  }, [trades, inspectorDate, scope]);

  // --- Trade form ---
  const emptyTradeForm = {
    account_id: scope !== 'portfolio' ? scope : '',
    symbol: '',
    direction: 'buy' as 'buy' | 'sell',
    entry: '',
    exit: '',
    profit: '',
    rr: '',
    session: 'London',
    notes: '',
  };
  const [tradeForm, setTradeForm] = useState({ ...emptyTradeForm });
  const openAddTrade = () => {
    setTradeForm({ ...emptyTradeForm, account_id: scope !== 'portfolio' ? scope : (scopeAccounts[0]?.id || '') });
    setTradeError(null);
    setShowAddTrade(true);
  };
  const handleSaveTrade = async () => {
    if (!user) return;
    if (!tradeForm.account_id) { setTradeError('Select the trading account.'); return; }
    if (!tradeForm.symbol.trim()) { setTradeError('Traded asset is required.'); return; }
    const pnl = Number(tradeForm.profit);
    if (tradeForm.profit.trim() === '' || isNaN(pnl)) { setTradeError('Profit / loss is required (0 for breakeven).'); return; }
    setSavingTrade(true);
    setTradeError(null);
    try {
      await onAddTrade({
        account_id: tradeForm.account_id,
        trade_date: inspectorDate!,
        symbol: tradeForm.symbol.trim().toUpperCase(),
        direction: tradeForm.direction,
        entry_price: tradeForm.entry.trim() === '' ? null : Number(tradeForm.entry),
        exit_price: tradeForm.exit.trim() === '' ? null : Number(tradeForm.exit),
        profit_loss: r2(pnl),
        rr_ratio: tradeForm.rr.trim() === '' ? null : Number(tradeForm.rr),
        session: tradeForm.session || null,
        notes: tradeForm.notes.trim() || null,
      });
      setShowAddTrade(false);
      setTradeForm({ ...emptyTradeForm, account_id: tradeForm.account_id });
    } catch (e: any) {
      setTradeError(e?.message || 'Failed to save trade.');
    } finally {
      setSavingTrade(false);
    }
  };
  const handleDeleteTrade = async (t: TradingTrade) => {
    const ok = await confirmDialog({
      title: `Delete ${t.symbol} trade?`,
      message: `${t.direction === 'buy' ? 'Buy' : 'Sell'} ${t.symbol} — P/L ${fmt(t.profit_loss)} will be permanently removed.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await onDeleteTrade(t.id);
  };

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
    const hasData = !!cell;
    const pos = (cell?.pnl || 0) > 0;
    const neg = (cell?.pnl || 0) < 0;
    return (
      <button
        key={key}
        onClick={() => cell && setInspectorDate(dk)}
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
            <div className="hidden sm:block text-[9px] text-slate-500 mt-1">{cell.tradeCount} trade{cell.tradeCount === 1 ? '' : 's'}</div>
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
        <td className="px-3 py-2.5 text-right font-mono text-[10px] text-slate-500">{c.tradeCount}</td>
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
              {activeDays.filter(d => (mergedSeries.get(d)!.pnl !== 0 || mergedSeries.get(d)!.tradeCount > 0)).length} active days
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
        {trades === null && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
            Trade journal unavailable — run <span className="font-mono">supabase_trading_terminal_migration.sql</span> in the Supabase SQL Editor, then refresh.
          </div>
        )}

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
                    <th className="px-3 py-2.5 text-right">Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {rangeDays.filter(d => mergedSeries.has(d)).map(dk => tableRow(dk))}
                  {rangeDays.filter(d => mergedSeries.has(d)).length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-slate-600">No recorded activity in this range.</td></tr>
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
                        <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-500">
                          {activeDays.reduce((s, d) => s + mergedSeries.get(d)!.tradeCount, 0)}
                        </td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ===== Day Trade Inspector ===== */}
      <Modal isOpen={!!inspectorDate} onClose={() => { setInspectorDate(null); setShowAddTrade(false); }} title={`Day Inspector — ${inspectorDate ? format(parseISO(inspectorDate), 'EEEE, dd MMM yyyy') : ''}`} wide>
        {inspectorDate && (
          <div className="space-y-4">
            {/* Day summary */}
            {inspectorCell && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                {[
                  { label: 'Start balance', value: fmt(inspectorCell.start), cls: 'text-slate-300' },
                  { label: 'Day P&L', value: (inspectorCell.pnl > 0 ? '+' : '') + fmt(inspectorCell.pnl), cls: pnlCls(inspectorCell.pnl) },
                  { label: 'Day ROI', value: (roiOf(inspectorCell.pnl, inspectorCell.start) >= 0 ? '+' : '') + roiOf(inspectorCell.pnl, inspectorCell.start).toFixed(2) + '%', cls: pnlCls(inspectorCell.pnl) },
                  { label: 'Close balance', value: fmt(inspectorCell.close), cls: 'text-slate-200' },
                ].map(s => (
                  <div key={s.label} className="bg-gray-900/70 border border-gray-800 rounded-lg p-2.5">
                    <p className="text-[9px] uppercase tracking-widest text-slate-600 font-bold">{s.label}</p>
                    <p className={`mt-0.5 font-bold ${s.cls}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Trade log */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Trade log {inspectorTrades.length > 0 && `(${inspectorTrades.length})`}
                </p>
                <button
                  onClick={openAddTrade}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gold-500/10 border border-gold-500/30 rounded-md text-[10px] font-bold text-gold-400 hover:bg-gold-500/20 transition-colors active:scale-95"
                >
                  <Plus size={11} /> Add trade
                </button>
              </div>

              {inspectorTrades.length === 0 && !showAddTrade && (
                <div className="py-8 text-center border border-dashed border-slate-800 rounded-lg">
                  <TrendingUp size={22} className="mx-auto text-slate-700 mb-2" />
                  <p className="text-xs text-slate-600">No trades recorded for this day.</p>
                  <p className="text-[10px] text-slate-700 mt-1">Log the executed trades to build the session history.</p>
                </div>
              )}

              <div className="space-y-2">
                {inspectorTrades.map(t => {
                  const acc = accounts.find(a => a.id === t.account_id);
                  return (
                    <div key={t.id} className="bg-gray-900/70 border border-gray-800 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-mono text-sm font-bold text-white">{t.symbol}</span>
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            t.direction === 'buy' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}>
                            {t.direction === 'buy' ? 'Buy / Long' : 'Sell / Short'}
                          </span>
                          {t.session && (
                            <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                              {t.session}
                            </span>
                          )}
                          {acc && scope === 'portfolio' && (
                            <span className="text-[9px] text-slate-600">{acc.name}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`font-mono text-sm font-bold ${pnlCls(t.profit_loss)}`}>
                            {t.profit_loss > 0 ? '+' : ''}{fmt(t.profit_loss)} {acc?.currency || baseCurrency}
                          </span>
                          <button
                            onClick={() => handleDeleteTrade(t)}
                            className="p-1 text-slate-600 hover:text-red-400 transition-colors"
                            aria-label="Delete trade"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 font-mono text-[11px] text-slate-500 flex-wrap">
                        {(t.entry_price !== null && t.entry_price !== undefined) && <span>Entry <span className="text-slate-300">{t.entry_price}</span></span>}
                        {(t.exit_price !== null && t.exit_price !== undefined) && <span>Exit <span className="text-slate-300">{t.exit_price}</span></span>}
                        {(t.rr_ratio !== null && t.rr_ratio !== undefined) && <span>R:R <span className="text-gold-400">{t.rr_ratio}</span></span>}
                      </div>
                      {t.notes && <p className="text-[11px] text-slate-500 mt-1">{t.notes}</p>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Add trade form */}
            {showAddTrade && (
              <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gold-400/80">New trade — {inspectorDate}</p>
                  <button onClick={() => setShowAddTrade(false)} className="text-slate-500 hover:text-white"><X size={14} /></button>
                </div>
                {scope === 'portfolio' && (
                  <div>
                    <label className={labelCls || 'block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5'}>Account *</label>
                    <SearchableSelect options={scopeAccounts} value={tradeForm.account_id} onChange={(v) => setTradeForm(f => ({ ...f, account_id: v }))} placeholder="Select account..." />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Traded asset *</label>
                    <input
                      value={tradeForm.symbol}
                      onChange={(e) => setTradeForm(f => ({ ...f, symbol: e.target.value }))}
                      placeholder="e.g. XAUUSD, BTCUSD, US30"
                      className={`${inputCls} font-mono`}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Direction</label>
                    <div className="flex gap-2">
                      {(['buy', 'sell'] as const).map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setTradeForm(f => ({ ...f, direction: d }))}
                          className={`flex-1 py-2.5 rounded-lg text-xs font-bold border transition-colors ${
                            tradeForm.direction === d
                              ? d === 'buy' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                              : 'bg-gray-900 border-gray-800 text-gray-500'
                          }`}
                        >
                          {d === 'buy' ? 'Buy / Long' : 'Sell / Short'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Entry price</label>
                    <input value={tradeForm.entry} onChange={(e) => setTradeForm(f => ({ ...f, entry: e.target.value }))} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono`} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Exit price</label>
                    <input value={tradeForm.exit} onChange={(e) => setTradeForm(f => ({ ...f, exit: e.target.value }))} inputMode="decimal" placeholder="0.00" className={`${inputCls} font-mono`} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Profit / Loss ({accounts.find(a => a.id === tradeForm.account_id)?.currency || baseCurrency}) *</label>
                    <input value={tradeForm.profit} onChange={(e) => setTradeForm(f => ({ ...f, profit: e.target.value }))} inputMode="decimal" placeholder="0.00 (− for loss)" className={`${inputCls} font-mono`} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Risk : Reward</label>
                    <input value={tradeForm.rr} onChange={(e) => setTradeForm(f => ({ ...f, rr: e.target.value }))} inputMode="decimal" placeholder="e.g. 2.5" className={`${inputCls} font-mono`} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Session</label>
                    <select
                      value={tradeForm.session}
                      onChange={(e) => setTradeForm(f => ({ ...f, session: e.target.value }))}
                      className={inputCls}
                    >
                      {SESSIONS.map(s => <option key={s} value={s}>{s} session</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Execution notes</label>
                    <input value={tradeForm.notes} onChange={(e) => setTradeForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className={inputCls} />
                  </div>
                </div>
                {tradeError && (
                  <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">{tradeError}</div>
                )}
                <button
                  onClick={handleSaveTrade}
                  disabled={savingTrade}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-gold-500 to-amber-400 text-black font-bold py-3 rounded-xl active:scale-95 transition-transform disabled:opacity-40"
                >
                  {savingTrade && <Loader2 size={15} className="animate-spin" />}
                  Save trade
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

// Small helper: label class used inside the modal
const labelCls = 'block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5';
const inputCls = 'w-full bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:border-gold-500 focus:ring-1 focus:ring-gold-500/30 outline-none transition-colors';
