# Upgrade Recurring Rule UI & Editing

This plan addresses the UI overhaul and editing functionality for Recurring rules within the Settings page, specifically focusing on Double-Entry visibility.

## Proposed Changes

### `src/pages/Settings.tsx`

We will update the Recurring tab to provide better visibility of double-entry accounting operations and allow full editing. 

#### 1. Recurring Item List UI Updates [MODIFY]
- **Title Integration**: Replace the "Untitled Recurring" fallback with the actual `rule.note` if it exists. We do not need to alter `types.ts` because `RecurringTransaction` already captures `note` (which acts as the description/title).
- **Double-Entry Display**: Update the subtitle to show explicitly which accounts are affected. Since `rule.accountId` maps to the Debit account and `rule.paymentAccountId` maps to the Credit account by design, we will use this logic to format output as:
  `Dr. [Debit Account Name] | Cr. [Credit Account Name] • [FREQUENCY]`
- **Edit Button Details**: Add a `Pencil` icon next to the existing `delete/Trash2` icon. Clicking this will populate editing state and open an edit modal.
- **Styling**: Maintain the glassmorphism dark theme, keeping amounts and dates right-aligned.

#### 2. Edit Modal Implementation [MODIFY]
We will add a dedicated edit form/modal inside `Settings.tsx` for recurring transactions. This form will allow editing:
- **Title / Description** (`note`)
- **Debit Account** (A dropdown using `SearchableSelect`)
- **Credit Account** (A dropdown using `SearchableSelect`)
- **Amount**
- **Frequency** (`daily`, `weekly`, `monthly`, `yearly`)
- **Next Due Date** (`nextDueDate`)

#### 3. State Handling [MODIFY]
- Create state variables: `editingRecurring` (to track the rule being edited) and `isRecurringModalOpen`.
- Implement `handleSaveRecurring` function that will dispatch the `UPDATE_RECURRING` action to the `FinanceContext` state engine to securely persist changes.

## Open Questions
- Since the schema already contains `note?: string` under `RecurringTransaction` which is mapped to the transaction reference strings, is it acceptable to keep using `note` as the Title/Description for these rules? (It effectively serves the same purpose without backend migration).

## Verification Plan

### Local UI Verification
- Load Settings > Recurring tab and confirm formatting changed to `Dr. X | Cr. Y`.
- Click `Edit` on an existing recurring rule.
- Modify the amount, accounts, and date, then submit.
- Verify the list updates instantly and the right-hand column retains proper alignment.
- Switch pages and return, ensuring the changes persist through internal state and `storageService`.
