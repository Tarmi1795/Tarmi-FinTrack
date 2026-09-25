
// AI_riane — AI CFO service.
// Providers: Z.ai GLM (OpenAI-compatible) is primary when VITE_ZAI_API_KEY is set;
// Google Gemini is the automatic fallback. Instead of dumping raw transactions,
// we precompute a financial summary so answers are faster, cheaper and more accurate.

import { GoogleGenAI } from "@google/genai";
import { AppState } from '../types';
import { format, parseISO, differenceInDays } from 'date-fns';
import { buildAccountTree, calculateDirectBalance } from '../utils/accountHierarchy';

const ZAI_BASE_URL = 'https://api.z.ai/api/paas/v4';
const ZAI_CHAT_MODEL = 'glm-4.6';
const ZAI_VISION_MODEL = 'glm-4.5v';

const getZaiKey = (): string => {
  try {
    // @ts-ignore
    const viteKey = import.meta.env.VITE_ZAI_API_KEY;
    if (viteKey && viteKey !== 'undefined' && viteKey.trim() !== '') return viteKey.trim();
    // @ts-ignore
    const pEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};
    const pKey = pEnv.VITE_ZAI_API_KEY || pEnv.ZAI_API_KEY || pEnv.Z_AI_API_KEY;
    if (pKey && pKey !== 'undefined' && pKey.trim() !== '') return pKey.trim();
    return '';
  } catch { return ''; }
};

const getGeminiKey = (): string => {
  try {
    // @ts-ignore
    const viteKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (viteKey && viteKey !== 'undefined' && viteKey.trim() !== '') return viteKey.trim();
    // @ts-ignore
    const pEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};
    const pKey = pEnv.VITE_GEMINI_API_KEY || pEnv.GEMINI_API_KEY || pEnv.GOOGLE_API_KEY;
    if (pKey && pKey !== 'undefined' && pKey.trim() !== '') return pKey.trim();
    return '';
  } catch { return ''; }
};

export const aiService = {
  isEnabled: () => !!(getZaiKey() || getGeminiKey()),
  activeProvider: () => (getZaiKey() ? 'zai' : getGeminiKey() ? 'gemini' : 'none'),

  /** CFO chat over a precomputed financial summary */
  askCFO: async (query: string, state: AppState): Promise<string> => {
    const summary = buildFinancialSummary(state);
    const system = buildSystemPrompt(state, summary);

    const zaiKey = getZaiKey();
    if (zaiKey) {
      try {
        return await askZai(zaiKey, ZAI_CHAT_MODEL, [
          { role: 'system', content: system },
          { role: 'user', content: query },
        ], 0.2);
      } catch (error: any) {
        const geminiKey = getGeminiKey();
        if (!geminiKey) return mapError(error);
        console.warn('AI_riane: z.ai failed, falling back to Gemini:', error?.message);
      }
    }

    const geminiKey = getGeminiKey();
    if (!geminiKey) {
      return "AI service is not configured. Add a VITE_ZAI_API_KEY (z.ai) or VITE_GEMINI_API_KEY to the environment.";
    }
    try {
      return await askGemini(geminiKey, `${system}\n\nUser Question: ${query}`);
    } catch (error: any) {
      return mapError(error);
    }
  },

  /** Vision extraction for receipts — returns freeform model output (JSON expected) */
  extractFromImage: async (imageDataUrl: string, prompt: string): Promise<string> => {
    const zaiKey = getZaiKey();
    if (zaiKey) {
      try {
        return await askZaiVision(zaiKey, imageDataUrl, prompt);
      } catch (error: any) {
        console.warn('AI_riane: z.ai vision failed, falling back to Gemini:', error?.message);
      }
    }
    const geminiKey = getGeminiKey();
    if (!geminiKey) throw new Error('No AI provider configured for vision.');
    return await askGeminiVision(geminiKey, imageDataUrl, prompt);
  },
};

// ---------- Z.ai (OpenAI-compatible) ----------

interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: any; }

async function askZai(key: string, model: string, messages: ChatMessage[], temperature: number): Promise<string> {
  const res = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`z.ai ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from z.ai.');
  return typeof content === 'string' ? content : JSON.stringify(content);
}

async function askZaiVision(key: string, imageDataUrl: string, prompt: string): Promise<string> {
  return askZai(key, ZAI_VISION_MODEL, [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageDataUrl } },
        { type: 'text', text: prompt },
      ],
    },
  ], 0.1);
}

// ---------- Gemini fallback ----------

async function askGemini(key: string, prompt: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: key });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.2 },
  });
  if (!response.text) throw new Error('Empty response from Gemini.');
  return response.text;
}

async function askGeminiVision(key: string, imageDataUrl: string, prompt: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: key });
  const match = imageDataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error('Invalid image data URL.');
  const [, mimeType, data] = match;
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data } },
        { text: prompt },
      ],
    }],
    config: { temperature: 0.1 },
  });
  if (!response.text) throw new Error('Empty response from Gemini vision.');
  return response.text;
}

function mapError(error: any): string {
  const m = error?.message || String(error);
  if (m.includes('401') || m.toLowerCase().includes('invalid api key') || m.toLowerCase().includes('api key')) {
    return "AI_riane: the API key was rejected. Please verify the key in the environment configuration.";
  }
  if (m.includes('429') || m.toLowerCase().includes('quota')) {
    return "AI_riane: I've hit the usage limit. Please try again in a minute!";
  }
  return `AI_riane encountered an error: ${m.substring(0, 180)}`;
}

// ---------- Precomputed financial summary ----------

const num = (v: any) => (typeof v === 'number' ? v : Number(v) || 0);

function buildFinancialSummary(state: AppState): object {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmtD = (d: string) => d.split('T')[0];

  // Cash accounts (111xx)
  const cashAccounts = state.accounts.filter(a => a.isPosting && (a.code.startsWith('111') || a.code === '11100'));
  const cash = cashAccounts.map(a => ({
    name: a.name,
    balance: Math.round(calculateDirectBalance(a.id, state.transactions, 'debit') * 100) / 100,
  }));
  const totalCash = cash.reduce((s, c) => s + c.balance, 0);

  // All-time balance sheet aggregates
  const tree = buildAccountTree(state.accounts, state.transactions);
  const classTotal = (cls: string) => {
    const nodes = (tree as any)[cls] || [];
    return Math.round(nodes.reduce((s: number, n: any) => s + (n.totalBalance || 0), 0) * 100) / 100;
  };

  // This-month performance (Revenue/COGS/OpEx from account classes)
  let revenue = 0, cogs = 0, opex = 0;
  state.transactions.forEach(t => {
    const d = parseISO(t.date);
    if (d < monthStart) return;
    const dr = state.accounts.find(a => a.id === t.accountId);
    const cr = state.accounts.find(a => a.id === t.paymentAccountId);
    if (cr?.class === 'Revenue') revenue += num(t.amount);
    if (dr?.class === 'Revenue') revenue -= num(t.amount);
    if (dr?.class === 'Expenses') {
      if (dr.code.startsWith('5')) cogs += num(t.amount); else opex += num(t.amount);
    }
    if (cr?.class === 'Expenses') {
      if (cr.code.startsWith('5')) cogs -= num(t.amount); else opex -= num(t.amount);
    }
  });

  // Budget (current month)
  const monthKey = format(today, 'yyyy-MM');
  const budget = state.monthlyBudgets?.find(b => b.monthKey === monthKey);

  // Receivables / payables aging
  const pending = state.receivables.filter(r => r.status === 'pending');
  const arItems = pending.filter(r => r.type === 'receivable').map(r => ({
    party: r.partyName, amount: Math.round(num(r.amount) - num(r.paidAmount)), due: fmtD(r.dueDate),
    daysOverdue: Math.max(0, differenceInDays(today, parseISO(r.dueDate))),
  }));
  const apItems = pending.filter(r => r.type === 'payable').map(r => ({
    party: r.partyName, amount: Math.round(num(r.amount) - num(r.paidAmount)), due: fmtD(r.dueDate),
    daysOverdue: Math.max(0, differenceInDays(today, parseISO(r.dueDate))),
  }));

  // Trading portfolio (latest snapshot per account)
  const tradingByAccount: Record<string, any> = {};
  (state as any).tradingSnapshots?.forEach?.((s: any) => {
    const prev = tradingByAccount[s.account_id];
    if (!prev || s.snap_date > prev.snap_date) tradingByAccount[s.account_id] = s;
  });
  const trading = Object.entries(tradingByAccount).slice(0, 20).map(([accountId, s]: [string, any]) => {
    const acc = (state as any).tradingAccounts?.find?.((a: any) => a.id === accountId);
    return acc ? { name: acc.name, currency: acc.currency, balance: num(s.balance) } : null;
  }).filter(Boolean);

  // Inventory
  const invItems = (state as any).inventoryItems || [];
  const inventory = {
    itemCount: invItems.length,
    stockValue: Math.round(invItems.reduce((s: number, i: any) => s + num(i.quantity) * num(i.cost_price), 0) * 100) / 100,
    lowStock: invItems.filter((i: any) => num(i.reorder_level) > 0 && num(i.quantity) <= num(i.reorder_level)).map((i: any) => i.name).slice(0, 10),
  };

  // Recent transactions
  const recent = [...state.transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 25)
    .map(t => ({
      date: fmtD(t.date),
      amount: num(t.amount),
      dr: state.accounts.find(a => a.id === t.accountId)?.name,
      cr: state.accounts.find(a => a.id === t.paymentAccountId)?.name,
      note: t.note,
    }));

  return {
    asOf: format(today, 'yyyy-MM-dd'),
    currency: state.businessProfile.baseCurrency || 'QAR',
    business: state.businessProfile.name,
    cash: { total: Math.round(totalCash * 100) / 100, accounts: cash },
    balanceSheet: {
      assets: classTotal('Assets'),
      liabilities: Math.abs(classTotal('Liabilities')),
      equity: Math.abs(classTotal('Equity')),
      revenueAllTime: Math.abs(classTotal('Revenue')),
      expensesAllTime: Math.abs(classTotal('Expenses')),
    },
    thisMonth: {
      revenue: Math.round(revenue * 100) / 100,
      cogs: Math.round(cogs * 100) / 100,
      opex: Math.round(opex * 100) / 100,
      net: Math.round((revenue - cogs - opex) * 100) / 100,
      budgetLimit: num(budget?.limit),
      note: 'revenue/expenses derive from account classes over transactions dated this month',
    },
    receivables: {
      totalOutstanding: Math.round(arItems.reduce((s, r) => s + r.amount, 0) * 100) / 100,
      top: arItems.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 8),
    },
    payables: {
      totalOutstanding: Math.round(apItems.reduce((s, r) => s + r.amount, 0) * 100) / 100,
      top: apItems.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 8),
    },
    trading,
    inventory,
    recentTransactions: recent,
  };
}

function buildSystemPrompt(state: AppState, summary: object): string {
  return `You are AI_riane, an expert AI CFO for "Tarmi FinTrack".

You receive a PRECOMPUTED FINANCIAL SUMMARY (balances, P&L, aging, portfolio, inventory, recent ledger activity). Trust these numbers — they were computed by the app's double-entry engine. Do not recalculate from raw data you don't have.

RULES:
- Currency is ${state.businessProfile.baseCurrency || 'QAR'} unless a figure states otherwise.
- Today's date is ${format(new Date(), 'yyyy-MM-dd')}.
- "profit" means revenue − expenses for the period asked; "cash" means the cash accounts total.
- Debts owed TO the user are receivables; owed BY the user are payables.
- Be concise and actionable. Use short paragraphs or bullet lists. Show numbers with thousands separators.
- If the summary lacks data for a question, say exactly what is missing instead of guessing.

FINANCIAL SUMMARY (JSON):
${JSON.stringify(summary)}`;
}
