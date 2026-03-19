# Implementation Plan: Dynamic Money Counter

## 1. Overview
The Dynamic Money Counter is a module designed to help users quickly calculate physical cash totals by inputting the quantity of various bills and coins. It will default to QAR (Qatari Riyal) denominations but will be fully dynamic, allowing users to manage (add, edit, disable) their own denominations via the database. CRUD

## 2. Database Schema (Supabase)
We will introduce two new tables to manage denominations and saved cash counts. give me SQL query for this update

### Table: `denominations`
Stores the available bills and coins for the user.
* `id` (uuid, Primary Key)
* `user_id` (uuid, Foreign Key to `auth.users`)
* `currency_code` (string, default: 'QAR')
* `value` (numeric, e.g., 500, 100, 50)
* `label` (string, e.g., '500 Riyal Bill')
* `type` (string: 'bill' | 'coin')
* `is_active` (boolean, default: true)
* `created_at` (timestamp)

### Table: `cash_counts` (Optional/Future-proofing)
Stores historical cash counting sessions.
* `id` (uuid, Primary Key)
* `user_id` (uuid, Foreign Key to `auth.users`)
* `total_amount` (numeric)
* `currency_code` (string)
* `breakdown` (jsonb - stores the exact count of each denomination)
* `notes` (text)
* `created_at` (timestamp)

## 3. Core Features & Logic
1. **Default Seeding**: When a user accesses the module for the first time, if they have no denominations in the database, the system will automatically seed the default QAR denominations (500, 100, 50, 10, 5, 1).
2. **Real-time Calculation**: As the user types the quantity for each bill/coin, the row subtotal and the grand total will update instantly.
3. **Denomination Management**: A settings area (or modal) within the module where users can add custom denominations (e.g., if they want to track foreign currency or specific coin rolls) or disable ones they don't use.
4. **Save/Clear**: Ability to clear the current count or save it to their history/journal.

## 4. UI/UX Components
* **`pages/MoneyCounter.tsx`**: The main page route.
  * **Header**: Title and Grand Total display (prominent, sticky).
  * **Counter Grid**: A list of active denominations. Each row will have:
    * Denomination Label & Value
    * Quantity Input (number)
    * Subtotal Display
  * **Action Buttons**: "Clear All", "Save Count", "Manage Denominations".
* **`components/DenominationManager.tsx`**: A modal or slide-out panel to perform CRUD operations on the `denominations` table.

## 5. Integration Steps
1. Create the Supabase SQL migration/setup script for the new tables and Row Level Security (RLS) policies.
2. Create the TypeScript interfaces for the new database tables in `types.ts`.
3. Build the `DenominationManager` component for database management.
4. Build the `MoneyCounter` page for the actual counting interface.
5. Add the `/money-counter` route to `App.tsx`.
6. Add a navigation link to the new module in the `Layout` sidebar/header.

