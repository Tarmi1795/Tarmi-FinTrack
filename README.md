
# Tarmi FinTrack Pro

## App Overview

**Tarmi FinTrack Pro** is a comprehensive, professional-grade financial tracking application designed for freelancers, solopreneurs, and individuals managing complex financial lives (personal expenses, stable employment, and side hustles).

Unlike simple expense trackers, Tarmi operates on a **Double-Entry Accounting Engine** disguised behind a modern, simple User Interface. It ensures financial integrity (Assets = Liabilities + Equity) while remaining accessible to non-accountants.

### Key Features
*   **Unified Dashboard**: View personal cash, business profit margins, and budget adherence in one view.
*   **Smart Entry**: "POS-style" shortcuts for frequent expenses and support for arithmetic expressions in input fields (e.g., type `50*4` to save `200`).
*   **Receivables & Payables**: Track invoices, bills, and personal loans with aging summaries.
*   **Asset Management**: Track fixed assets (computers, vehicles) with **automatic monthly depreciation**.
*   **Cloud Sync**: Optional End-to-End encrypted synchronization via Supabase.
*   **AI CFO**: Integrated AI assistant to analyze financial data and answer natural language queries.
*   **Offline First**: Built as a PWA (Progressive Web App) to work seamlessly without internet.

---

## User Instructions

### 1. Installation (PWA)
For the best experience, install Tarmi as a native app:
*   **iOS**: Open in Safari → Tap 'Share' → Select 'Add to Home Screen'.
*   **Android/Chrome**: Tap the Menu (⋮) → Select 'Install App'.
*   **Desktop**: Click the install icon in the browser address bar.

### 2. Getting Started
1.  **Set Password**: On first launch, create a local lock password to encrypt your session.
2.  **Configure Accounts**: Go to `Settings` -> `Chart of Accounts`. Review the default accounts or add your own (e.g., specific bank accounts, revenue streams).
3.  **Business Profile**: In `Settings`, add your business details for invoice generation.

### 3. Recording Transactions
*   **Quick Add**: Click the `+` button.
*   **Templates**: Create shortcuts in `Settings` for recurring items like "Coffee" or "Fuel".
*   **Math Input**: In amount fields, you can type expressions like `100+50` or `1200/4`. The app calculates the result instantly on blur.

### 4. Managing Debt (Receivables/Payables)
*   **Invoices**: Go to Receivables. Create an Invoice to record revenue immediately (Accrual basis). When you get paid, click **Receive** to increase your cash balance.
*   **Bills**: Go to Payables. Record a bill to recognize the expense immediately. Click **Pay** when money actually leaves your account.

### 5. Assets & Depreciation
*   Add large purchases (Laptops, Equipment) in the **Assets** tab.
*   Set the **Useful Life** (years).
*   The system automatically creates "Depreciation Expense" transactions every month, reducing the book value of the asset over time.

### 6. AI Financial Assistant
*   **Access**: Click the sparkle icon (✨) in the bottom right corner.
*   **Capabilities**: The AI has read-access to your ledger. Ask questions like:
    *   "What is my net profit for this year?"
    *   "Who are my top 3 customers?"
    *   "Analyze my spending on food."

---

## Financial Audit & Calculation Manual

This section details the mathematical models, accounting algorithms, and aggregation logic used within the Tarmi FinTrack system.

### 1. Core Data Model & Double-Entry Logic

While the user interface offers a simplified "Single Entry" experience, the backend logic enforces a pseudo-Double-Entry bookkeeping system via the `Transaction` object.

#### The Transaction Object ($T$)
Every financial event is stored as a transaction $T$ with the following properties:
*   $A$: Amount (Absolute value in QAR).
*   $Dr$: `categoryId` (The account receiving value / Debit).
*   $Cr$: `paymentAccountId` (The account giving value / Credit).
*   $Type$: The nature of the transaction (Income, Expense, Transfer).

#### Base Currency Normalization
All computations are performed in **Qatari Riyal (QAR)**.
If input is in PHP, it is normalized upon entry:
$$ A_{QAR} = \frac{A_{PHP}}{15.80} $$
*Note: The exchange rate is currently fixed as a constant.*

---

### 2. General Ledger Algorithms

The system does not store running balances. All account balances are computed on-the-fly by aggregating the transaction history up to a specific date $D$.

#### 2.1. Account Balance Function: $Bal(Account_i)$
For any given account $i$ (Asset, Liability, Equity, Income, or Expense), the raw ledger balance is calculated as:

$$ Bal(i) = \sum_{t \in T} (A_t \cdot \delta_{Dr}) - \sum_{t \in T} (A_t \cdot \delta_{Cr}) $$

Where:
*   $\delta_{Dr} = 1$ if $T.categoryId = i$, else $0$.
*   $\delta_{Cr} = 1$ if $T.paymentAccountId = i$, else $0$.

#### 2.2. Normal Balance Interpretation
*   **Assets & Expenses:** Debit Normal. A positive $Bal(i)$ implies a standard balance.
*   **Liabilities, Equity, & Revenue:** Credit Normal. The raw $Bal(i)$ will be negative.
    *   *Display Logic:* For UI reporting, we display $|Bal(i)|$ for Credit Normal accounts.

---

### 3. Financial Reports Logic

#### 3.1. Income Statement (Profit & Loss)
Defined over a time interval $[t_{start}, t_{end}]$.

1.  **Revenue ($R$):**
    $$ R = \sum |Bal(i)_{interval}| \quad \forall i \in \{Groups: \text{'revenue', 'professional\_income'}\} $$
2.  **Cost of Goods Sold ($COGS$):**
    $$ COGS = \sum Bal(i)_{interval} \quad \forall i \in \{Groups: \text{'direct\_costs'}\} $$
3.  **Gross Profit ($GP$):**
    $$ GP = R - COGS $$
4.  **Operating Expenses ($OpEx$):**
    $$ OpEx = \sum Bal(i)_{interval} \quad \forall i \in \{Groups: \text{'expenses'}\} $$
    *Includes Depreciation Expense ($GL_{6099}$)*.
5.  **Net Income ($NI$):**
    $$ NI = GP - OpEx $$

#### 3.2. Balance Sheet (Statement of Financial Position)
Calculated as of a specific date $D$.

**Assets ($A$)**
$$ A = A_{current} + A_{fixed} + A_{contra} $$

*   **Current Assets ($A_{current}$):** $Bal(i)$ for liquid assets (Bank, Cash, AR).
*   **Fixed Assets ($A_{fixed}$):** $Bal(i)$ representing **Original Cost** ($GL_{1500+}$).
*   **Accumulated Depreciation ($A_{contra}$):** $Bal(i)$ for $GL_{1599}$.
    *   *Note:* Since $GL_{1599}$ is Credit Normal, $Bal(1599)$ returns a negative value. Therefore, it mathematically reduces Total Assets when summed.

**Liabilities ($L$)**
$$ L = \sum |Bal(i)| \quad \forall i \in \{Groups: \text{'liabilities'}\} $$
*   Includes Accounts Payable ($GL_{2001}$).

**Equity ($E$)**
$$ E = E_{opening} + RE $$

*   **Opening Balance ($E_{opening}$):** $|Bal(7001)|$.
*   **Retained Earnings ($RE$):** Calculated dynamically as the sum of all historical Net Income up to date $D$.
    $$ RE = \sum_{t=0}^{D} (Income_t - Expense_t) $$

**The Accounting Equation Check**
The system validates integrity by asserting:
$$ (A_{current} + A_{fixed} + A_{contra}) - (L + E_{opening} + RE) = 0 $$
*Any deviation is flagged as an "Unbalanced" amount in the report.*

---

### 4. Depreciation Algorithm

Depreciation is processed automatically using the **Straight-Line Method**.

#### Variables
*   $C$: Original Cost (Asset Value).
*   $L$: Useful Life in Years.
*   $n$: Months passed since purchase/last run.

#### Computation
1.  **Monthly Expense ($D_m$):**
    $$ D_m = \frac{C}{L \times 12} $$
2.  **Journal Entry Generation:**
    For every month $n$ passed:
    *   **Debit:** Depreciation Expense ($GL_{6099}$) $\leftarrow D_m$
    *   **Credit:** Accumulated Depreciation ($GL_{1599}$) $\leftarrow D_m$
3.  **Net Book Value (NBV):**
    Displayed in Assets UI (but not stored as GL balance):
    $$ NBV = C - \sum D_m $$

---

### 5. Cash Flow (Direct Method)

The Cash Flow Statement tracks actual movement in specific "Cash" accounts (Group: `asset_current`).

Let $S_{cash}$ be the set of all account IDs in `asset_current` (Bank, Cash, Wallet).

1.  **Cash Inflow ($CF_{in}$):**
    $$ CF_{in} = \sum A_t \quad \text{where } (T.categoryId \in S_{cash}) $$
    *Includes Income deposited to bank, or Transfers from Equity to bank.*

2.  **Cash Outflow ($CF_{out}$):**
    $$ CF_{out} = \sum A_t \quad \text{where } (T.paymentAccountId \in S_{cash}) $$
    *Includes Expenses paid by bank, or Transfers from bank to other accounts.*

3.  **Net Change:**
    $$ \Delta Cash = CF_{in} - CF_{out} $$

---

### 6. Accounts Receivable & Payable (Aging)

This utilizes a subsidiary ledger (`receivables` table) separate from the GL, though linked via accrual entries.

#### Aging Logic
For a receivable $R$:
*   **Current:** $Status = 'pending'$ AND $Date_{due} \ge Date_{now}$
*   **Overdue:** $Status = 'pending'$ AND $Date_{due} < Date_{now}$

#### Accrual Integration
When a Receivable/Payable is created, the system generates a GL entry:
*   **Receivable:** Dr Accounts Receivable ($GL_{1100}$), Cr Revenue.
*   **Payable:** Dr Expense, Cr Accounts Payable ($GL_{2001}$).

When Paid:
*   **Receivable:** Dr Bank, Cr Accounts Receivable ($GL_{1100}$).
*   **Payable:** Dr Accounts Payable ($GL_{2001}$), Cr Bank.

---

### 7. Business Performance Metrics (Dashboard)

**Gross Margin**
$$ \text{Margin \%} = \left( \frac{\text{Revenue} - \text{Direct Costs}}{\text{Revenue}} \right) \times 100 $$

**Budget Utilization**
For a specific month $M$:
$$ \text{Usage \%} = \left( \frac{\sum \text{Expenses in } M}{\text{Budget Limit}_M} \right) \times 100 $$
