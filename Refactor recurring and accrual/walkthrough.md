# Settings Recurring Upgrade Walkthrough

The **Recurring** tab in the Settings page has been significantly upgraded to match professional double-entry standards and allow full modification of existing automated rules.

## Changes Made

### 1. Transparent Accounting (Double-Entry Display)
Instead of simply showing the debit account name, the list item now clearly reflects the full journal entry that will be generated:
> `Dr. [Debit Account Name] | Cr. [Credit Account Name] • [Frequency]`

This makes it instantly clear which accounts are impacted when the automation fires. If no credit account is specified, it gracefully degrades to show `Cr. None`. We also linked the system's `note` field to display as the title/description instead of hardcoding "Untitled Recurring".

### 2. Live Edit Functionality
An **Edit** button (pencil icon) has been added next to the delete icon for each recurring rule.

Clicking this opens a responsive modal that lets you modify:
- **Description:** Useful for identifying rules (e.g. "Monthly Cloud Server").
- **Debit & Credit Accounts:** Powered by our searchable dropdown component for fast filtering.
- **Amount & Frequency:** Adjust price changes or switch intervals instantly.
- **Next Due Date:** Force an early run or pause a recurring cost by shifting the date into the future.

## Verification & Usage
You can test this right now in your live preview:
1. Navigate to **Settings** > **Recurring** tab (represented by the repeat icon).
2. Look at the existing recurring transactions; notice the updated formatting showing full debit/credit paths.
3. Click the pencil icon on any item.
4. Modify the frequency or description, and hit "Save Changes" to see the updates hit real-time in the UI and state store without duplicating the record.
