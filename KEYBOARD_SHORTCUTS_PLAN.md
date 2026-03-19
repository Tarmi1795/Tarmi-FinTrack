
# Keyboard Navigation & Shortcuts Implementation Plan

## Objective
To reduce reliance on the mouse and increase data entry speed by implementing standard and custom keyboard shortcuts across the application.

## 1. Global Shortcuts (Layout Level)

We will implement a global event listener in `components/Layout.tsx` to handle application-wide shortcuts.

### A. Quick Add Transaction (`Numpad +`)
*   **Trigger:** `NumpadAdd` key.
*   **Behavior:** Opens the "Quick Transaction" modal.
*   **Conflict Prevention:**
    *   The event listener must check `document.activeElement`.
    *   If the focus is currently on an `<input>` or `<textarea>`, the event will be ignored (allowing math input like `50+` inside the form).
    *   If a modal is already open, the event will be ignored.

### B. Global Search (`Ctrl + F`)
*   **Trigger:** `Ctrl + F` (Windows/Linux) or `Cmd + F` (Mac).
*   **Behavior:**
    *   Prevent default browser "Find in Page" behavior.
    *   Navigate the user to `/journal`.
    *   Focus the Search input field within the Journal page automatically.
*   **Implementation Detail:**
    *   Use `navigate('/journal', { state: { focusSearch: true } })`.
    *   Update `pages/Journal.tsx` to read this state and focus the input ref.

## 2. Component Enhancements (`SearchableSelect.tsx`)

The custom dropdown component needs robust keyboard handling to mimic native HTML select behavior while maintaining the custom UI.

### A. Tab Navigation
*   **Current Issue:** Pressing Tab moves focus away without selecting the currently highlighted item if the menu is open.
*   **New Behavior:**
    *   Intercept `Tab` key in `onKeyDown`.
    *   If the menu is **open** and an option is **highlighted**:
        1.  Select the highlighted option (update value).
        2.  Close the menu.
        3.  Allow the default Tab behavior to proceed (moving focus to the next focusable element).
    *   If the menu is closed, standard Tab behavior applies.

### B. Arrow Navigation
*   **Behavior:**
    *   `ArrowDown`: Move highlight to next option. Open menu if closed.
    *   `ArrowUp`: Move highlight to previous option.
    *   Ensure the list container scrolls automatically to keep the highlighted item in view (already partially implemented, needs verification). developer verification, on sidebar menu is not implemented

### C. Selection
*   **Trigger:** `Enter`.
*   **Behavior:** Select highlighted item and close menu (already exists, but will ensure it works seamlessly with the Tab flow).

## 3. Page Level Updates

### A. Journal Page (`pages/Journal.tsx`)
*   Add a `useRef` to the Search Input.
*   Add a `useEffect` to check `location.state?.focusSearch`. If true, focus the input.

### B. Transaction Form (`components/TransactionForm.tsx`)
*   Ensure `tabIndex` is logical so the user flows from:
    *   Type -> Amount -> Currency -> Account -> Payment Account -> Notes -> Save.
*   The `Math Toolbar` buttons should keep `tabIndex={-1}` (already done) to prevent breaking the flow.

## Implementation Steps

1.  **Modify `components/ui/SearchableSelect.tsx`**: Implement Tab selection logic.
2.  **Modify `pages/Journal.tsx`**: Add search focus capability via router state.
3.  **Modify `components/Layout.tsx`**: Add global `keydown` listener for `NumpadAdd` and `Ctrl+F`.
4.  **Testing**: Verify `50+` in input does not trigger modal, but `+` outside input does. Verify Tab selects item and moves to next field.

