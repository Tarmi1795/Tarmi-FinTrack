
import * as XLSX from 'xlsx';
import { AppState, MonthlyBudget, Receivable, Asset, Transaction, Account, Party, RecurringTransaction } from '../types';

export const excelService = {
  /**
   * Export the current AppState to a multi-sheet XLSX file.
   */
  exportDataToExcel: (data: AppState) => {
    const wb = XLSX.utils.book_new();

    // 1. Budget Sheet (Flattened)
    const budgetRows = (data.monthlyBudgets || []).map(b => {
        const row: any = {
            monthKey: b.monthKey,
            limit: b.limit,
            visibleAccountIds: b.visibleAccountIds ? b.visibleAccountIds.join(',') : ''
        };
        // Flatten limits: limit_accId = value
        if (b.categoryLimits) {
            Object.entries(b.categoryLimits).forEach(([accId, amount]) => {
                row[`limit_${accId}`] = amount;
            });
        }
        return row;
    });
    const wsBudget = XLSX.utils.json_to_sheet(budgetRows);
    XLSX.utils.book_append_sheet(wb, wsBudget, "Budget");

    // 2. Receivables (Separated)
    const receivables = data.receivables.filter(r => r.type === 'receivable').map(r => ({
        ...r,
        recurring: r.recurring ? JSON.stringify(r.recurring) : ''
    }));
    const wsRec = XLSX.utils.json_to_sheet(receivables);
    XLSX.utils.book_append_sheet(wb, wsRec, "Receivables");

    // 3. Payables (Separated)
    const payables = data.receivables.filter(r => r.type === 'payable').map(r => ({
        ...r,
        recurring: r.recurring ? JSON.stringify(r.recurring) : ''
    }));
    const wsPay = XLSX.utils.json_to_sheet(payables);
    XLSX.utils.book_append_sheet(wb, wsPay, "Payables");

    // 4. Assets
    const assets = data.assets.map(a => ({
        ...a,
        // Ensure dates are strings
        purchaseDate: a.purchaseDate ? new Date(a.purchaseDate).toISOString() : '',
        lastDepreciationDate: a.lastDepreciationDate ? new Date(a.lastDepreciationDate).toISOString() : ''
    }));
    const wsAssets = XLSX.utils.json_to_sheet(assets);
    XLSX.utils.book_append_sheet(wb, wsAssets, "Assets");

    // 5. Journal (Transactions)
    const journal = data.transactions.map(t => ({
        ...t,
        date: t.date ? new Date(t.date).toISOString() : ''
    }));
    const wsJournal = XLSX.utils.json_to_sheet(journal);
    XLSX.utils.book_append_sheet(wb, wsJournal, "Journal");

    // 6. Chart of Accounts
    const coa = data.accounts.map(c => ({
        ...c
    }));
    const wsCOA = XLSX.utils.json_to_sheet(coa);
    XLSX.utils.book_append_sheet(wb, wsCOA, "Chart of Accounts");

    // 7. Parties
    const wsParties = XLSX.utils.json_to_sheet(data.parties);
    XLSX.utils.book_append_sheet(wb, wsParties, "Parties");
    
    // 8. Recurring Rules
    const recurring = (data.recurring || []).map(r => ({
        ...r,
        nextDueDate: r.nextDueDate ? new Date(r.nextDueDate).toISOString() : ''
    }));
    const wsRecurring = XLSX.utils.json_to_sheet(recurring);
    XLSX.utils.book_append_sheet(wb, wsRecurring, "Recurring Rules");

    // Generate file
    XLSX.writeFile(wb, `Tarmi_Backup_${new Date().toISOString().split('T')[0]}.xlsx`);
  },

  /**
   * Parse an uploaded Excel file and reconstruct the AppState.
   */
  importDataFromExcel: async (file: File): Promise<Partial<AppState>> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const wb = XLSX.read(data, { type: 'array', cellDates: false }); // keep dates as strings/numbers primarily
                
                const result: Partial<AppState> = {};

                // Helper to get sheet data
                const getSheet = (name: string) => {
                    const ws = wb.Sheets[name];
                    return ws ? XLSX.utils.sheet_to_json(ws) : [];
                };

                // 1. Parse Budgets (Un-flatten)
                const rawBudgets = getSheet("Budget") as any[];
                result.monthlyBudgets = rawBudgets.map(row => {
                    const budget: MonthlyBudget = {
                        monthKey: row.monthKey,
                        limit: Number(row.limit) || 0,
                        visibleAccountIds: row.visibleAccountIds ? String(row.visibleAccountIds).split(',') : [],
                        categoryLimits: {}
                    };
                    
                    // Extract dynamic limits
                    Object.keys(row).forEach(key => {
                        if (key.startsWith('limit_')) {
                            const accId = key.replace('limit_', '');
                            if (budget.categoryLimits) {
                                budget.categoryLimits[accId] = Number(row[key]);
                            }
                        }
                    });
                    return budget;
                });

                // 2. Parse Receivables & Payables (Merge & Un-stringify)
                const rawRec = getSheet("Receivables") as any[];
                const rawPay = getSheet("Payables") as any[];
                
                const processReceivable = (row: any, type: 'receivable' | 'payable'): Receivable => {
                    return {
                        id: String(row.id),
                        type: type,
                        partyName: row.partyName,
                        amount: Number(row.amount),
                        paidAmount: Number(row.paidAmount || 0), // Added import mapping
                        currency: row.currency,
                        dueDate: String(row.dueDate),
                        status: row.status,
                        notes: row.notes,
                        targetAccountId: row.targetAccountId,
                        partyId: row.partyId,
                        recurring: row.recurring ? JSON.parse(row.recurring) : undefined
                    } as Receivable;
                };

                const parsedRecs = rawRec.map(r => processReceivable(r, 'receivable'));
                const parsedPays = rawPay.map(r => processReceivable(r, 'payable'));
                result.receivables = [...parsedRecs, ...parsedPays];

                // 3. Assets
                const rawAssets = getSheet("Assets") as any[];
                result.assets = rawAssets.map(row => ({
                    ...row,
                    id: String(row.id),
                    value: Number(row.value),
                    originalValue: Number(row.originalValue),
                    usefulLifeYears: Number(row.usefulLifeYears),
                    // Ensure linkedAccountId is treated as string even if excel makes it a number
                    linkedAccountId: String(row.linkedAccountId)
                })) as Asset[];

                // 4. Journal
                const rawJournal = getSheet("Journal") as any[];
                result.transactions = rawJournal.map(row => ({
                    ...row,
                    id: String(row.id),
                    amount: Number(row.amount),
                    originalAmount: row.originalAmount ? Number(row.originalAmount) : undefined,
                    // Handle Excel making accountId a number if it looks like one
                    accountId: String(row.accountId),
                    paymentAccountId: row.paymentAccountId ? String(row.paymentAccountId) : undefined
                })) as Transaction[];

                // 5. COA
                const rawCOA = getSheet("Chart of Accounts") as any[];
                result.accounts = rawCOA.map(row => ({
                    ...row,
                    id: String(row.id),
                    // Ensure code is string
                    code: String(row.code),
                })) as Account[];

                // 6. Parties
                const rawEnt = getSheet("Parties") as any[];
                result.parties = rawEnt.map(row => ({
                    ...row,
                    id: String(row.id)
                })) as Party[];
                
                // 7. Recurring Rules
                const rawRecurring = getSheet("Recurring Rules") as any[];
                result.recurring = rawRecurring.map(row => ({
                    ...row,
                    id: String(row.id),
                    active: Boolean(row.active)
                })) as RecurringTransaction[];

                resolve(result);

            } catch (err) {
                console.error("Excel Parse Error:", err);
                reject(err);
            }
        };
        reader.readAsArrayBuffer(file);
    });
  }
};
