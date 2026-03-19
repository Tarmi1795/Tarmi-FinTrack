import { GoogleGenAI } from "@google/genai";
import { AppState } from '../types';
import { format } from 'date-fns';

const getApiKey = () => {
  try {
    // 1. Try Vite's import.meta.env (standard)
    // @ts-ignore
    const viteKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (viteKey && viteKey !== 'undefined' && viteKey.trim() !== '') return viteKey.trim();

    // 2. Try process.env fallback (defined in vite.config.ts)
    // @ts-ignore
    const pEnv = (typeof process !== 'undefined' && process.env) ? process.env : {};
    // @ts-ignore
    const pKey = pEnv.VITE_GEMINI_API_KEY || pEnv.GEMINI_API_KEY || pEnv.GOOGLE_API_KEY;
    if (pKey && pKey !== 'undefined' && pKey.trim() !== '') return pKey.trim();

    return '';
  } catch (e) {
    return '';
  }
};

export const aiService = {
  isEnabled: () => !!getApiKey(),

  /**
   * Generates a financial analysis or answer based on the current app state.
   */
  askCFO: async (query: string, state: AppState): Promise<string> => {
    const key = getApiKey();
    if (!key) {
      console.warn("Arlene: No API Key found in environment.");
      return "AI service is not configured (Missing API Key). Please check your Settings.";
    }

    console.log(`Arlene: Using API Key (length: ${key.length}, starts with: ${key.substring(0, 3)}...)`);

    try {
      const ai = new GoogleGenAI({ apiKey: key });

      // 1. Prepare Context (Full Raw Data)
      const context = prepareFinancialContext(state);

      // 2. System Instruction
      const systemInstruction = `
        You are Arlene, an expert AI CFO for "Tarmi FinTrack".
        
        DATA STRUCTURE:
        You have access to the full raw database in JSON format:
        1. "accounts": Definitions of income/expense buckets (Chart of Accounts).
        2. "transactions": The ledger of all money movements. (Links to accounts via 'accountId' and 'paymentAccountId').
        3. "receivables": Tracking of debts and money owed.

        RULES:
        - The currency is QAR (Qatari Riyal).
        - Today's date is ${format(new Date(), 'yyyy-MM-dd')}.
        - You must calculate totals dynamically from the "transactions" list.
        - If the user asks for "profit", calculate (Total Revenue - Total Expense).
        - If the user asks about a specific person (e.g., "How much do I owe Arlene?"), check the "receivables" list.
        - Be concise and actionable.
      `;

      // 3. Generate Content
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [{
              text: `Financial Data Context:\n${JSON.stringify(context)}\n\nUser Question: ${query}`
            }]
          }
        ],
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.1, // Lower for more reliable data extraction
        }
      });

      if (!response.text) {
        throw new Error("Empty response from AI model.");
      }

      return response.text;
    } catch (error: any) {
      console.error("AI Error Details:", error);

      const errorMessage = error?.message || String(error);

      // Check for the specific "unregistered callers" error which usually means the key is being sent but is invalid/empty
      if (errorMessage.includes("unregistered callers") || errorMessage.includes("403")) {
        return `Arlene: I'm having trouble with the API key. It looks like it's being sent (length ${key.length}), but Google is rejecting it. Please make sure you copied the FULL key from AI Studio and that it's named GEMINI_API_KEY in your Settings.`;
      }

      if (errorMessage.includes("API_KEY_INVALID") || errorMessage.includes("invalid API key")) {
        return "Arlene: The API key provided is invalid. Please double-check it in your Settings.";
      }

      if (errorMessage.includes("quota") || errorMessage.includes("429")) {
        return "Arlene: I've hit my usage limit. Please try again in a minute!";
      }

      return `Arlene encountered an error: ${errorMessage.substring(0, 150)}`;
    }
  }
};

/**
 * Helper to prepare the raw data feed.
 * Strips UI-specific fields to save tokens while preserving financial integrity.
 */
function prepareFinancialContext(state: AppState) {
  // 1. Accounts: Keep ID, Name, Class
  const accounts = state.accounts.map(c => ({
    id: c.id,
    name: c.name,
    class: c.class,
    code: c.code
  }));

  // 2. Transactions: Keep Date, Type, Amount, Account Links, and Notes
  const transactions = state.transactions.map(t => ({
    date: t.date.split('T')[0], // Simplified Date
    type: t.type,
    amount: t.amount,
    accountId: t.accountId,
    paymentAccountId: t.paymentAccountId,
    note: t.note
  }));

  // 3. Receivables: Keep Name, Amount, Due Date, and Status
  const receivables = state.receivables.map(r => ({
    type: r.type, // 'receivable' (owed to me) or 'payable' (owed by me)
    name: r.partyName,
    amount: r.amount,
    dueDate: r.dueDate.split('T')[0],
    status: r.status, // 'pending', 'paid'
    notes: r.notes
  }));

  return {
    accounts,
    transactions,
    receivables
  };
}