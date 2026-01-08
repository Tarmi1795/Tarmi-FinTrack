import { GoogleGenAI } from "@google/genai";
import { AppState } from '../types';
import { format } from 'date-fns';

const AI_KEY = process.env.API_KEY || '';

export const aiService = {
  isEnabled: () => !!AI_KEY,

  /**
   * Generates a financial analysis or answer based on the current app state.
   */
  askCFO: async (query: string, state: AppState): Promise<string> => {
    if (!AI_KEY) return "AI service is not configured (Missing API Key).";

    try {
      const ai = new GoogleGenAI({ apiKey: AI_KEY });
      
      // 1. Prepare Context (Full Raw Data)
      const context = prepareFinancialContext(state);
      
      // 2. System Instruction
      const systemInstruction = `
        You are an expert AI CFO for "Tarmi FinTrack".
        
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
        model: 'gemini-2.5-flash',
        contents: `
          Context Data:
          ${JSON.stringify(context)}

          User Query:
          ${query}
        `,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.2, // Lower temperature for better math consistency
        }
      });

      return response.text || "I couldn't generate a response.";
    } catch (error) {
      console.error("AI Error:", error);
      return "Sorry, I encountered an error analyzing your finances. Please try again later.";
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