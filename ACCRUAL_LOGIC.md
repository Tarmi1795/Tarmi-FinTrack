# Accrual & Recurring Transaction Logic

This document details the financial engineering and automation logic used in **Tarmi FinTrack Pro** to ensure accounting integrity.

---

## 1. Accrual Logic (AR/AP System)

Unlike simple "cash basis" apps that only record money when it leaves your wallet, Tarmi uses an **Accrual Engine**. This means it recognizes financial events the moment they occur (Invoices/Bills), regardless of when cash moves.

### The Workflow

#### Phase 1: Creation (Accrual Event)
When you create an **Invoice** (Receivable) or a **Bill** (Payable), the system automatically generates a **Journal Entry** (see `FinanceContext.tsx` and `ApAr.tsx`):
*   **Invoices**: `Debit` Accounts Receivable ($GL_{11200}$) and `Credit` Revenue. Your "Net Worth" increases immediately.
*   **Bills**: `Debit` Expense and `Credit` Accounts Payable ($GL_{21100}$). Your "Profit" decreases immediately.
*   **Linking**: These transactions are tagged with a unique `Ref:ID` in the notes to link the Ledger to the Subsidiary (AR/AP) table.

#### Phase 2: Settlement (Cash Event)
When you click **"Receive Payment"** or **"Pay Bill"**:
*   The system records a **Balance Sheet Transfer**: `Debit` Cash/Bank and `Credit` Accounts Receivable.
*   The original income/expense is **not** re-recorded. This prevents "double-counting" and correctly flips the asset from "Owed" to "Cash".

#### Phase 3: Synchronization & Integrity
The system maintains strict integrity via a "Cascade" logic in the reducer:
*   **Reversion**: If you delete a "Settlement" transaction in the Journal, the Invoice status automatically reverts to **"Pending"** and the `paidAmount` is reversed.
*   **Cleanup**: If you delete the "Origin/Accrual" transaction, the entire Invoice/Bill record is removed to prevent "ghost" receivables that have no ledger basis.

---

## 2. Recurring Transactions Logic

The recurring system is an **Automated Scheduler** that runs locally within the browser whenever the app state is loaded or updated.

### The Workflow

1.  **Scanning**: A `useEffect` hook in `FinanceContext.tsx` monitors the `recurring` rules array. Each rule contains a `frequency` (daily, weekly, monthly, yearly) and a `nextDueDate`.
2.  **Triggering (The "Catch-Up" Mechanism)**: When the app detects that `nextDueDate` is in the past:
    *   It generates a new `Transaction` object using the rule's template (Account, Amount, Category).
    *   It injects this into the main Ledger.
    *   **Strict Date Calculation**: It uses `date-fns` to calculate the *next* occurrence. If a monthly transaction was due on Jan 1st and it's now March 5th, the app will recursively "catch up" and generate Jan, Feb, and March entries instantly.
3.  **Persistence**: The updated `nextDueDate` and `lastRunDate` are saved back to Supabase/LocalStorage to ensure the same transaction is never generated twice.

---

## 3. Summary Table: Comparison

| Feature | Accruals (AR/AP) | Recurring Transactions |
| :--- | :--- | :--- |
| **Logic Type** | Event-Driven (Manual Entry) | Time-Driven (Automated) |
| **Accounting Basis** | Accrual Basis (Recognize now, pay later) | Mixed (Automation of Ledger Events) |
| **Primary Goal** | Tracking Debt and Credit (Ageing) | Reducing Manual Data Entry for Subscriptions |
| **Linkage** | Linked via `Ref:ID` in Transaction Notes | Linked via `RecurringRuleID` |

---

## 4. Technical Implementation Reference

*   **Logic Container**: `src/context/FinanceContext.tsx`
*   **AR/AP Processing**: `src/pages/ApAr.tsx`
*   **Automation Loop**: `useEffect` hook (Line 438+ in `FinanceContext.tsx`)
*   **Database Mapping**: `src/services/supabase.ts`
