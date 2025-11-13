# Global Keyboard Shortcuts System - Implementation Summary

## Feature Overview

Implemented a global keyboard shortcuts system with permission-based access control, allowing users to quickly access common actions via keyboard shortcuts.

**Implementation Date:** 2025-11-13
**Status:** Complete
**Test Coverage:** 51 unit tests, 13 E2E tests

---

## Features Implemented

### 1. Keyboard Shortcuts

| Shortcut | Action | Permission Required | Notes |
|----------|--------|---------------------|-------|
| `Ctrl+M` / `Cmd+M` | Quick add measurement | `CREATE_MEASUREMENTS` | Cross-platform (Windows/Linux/Mac) |
| `?` | Show keyboard shortcuts help | None | Available to all users |
| `Escape` | Close modals/dialogs | None | Universal modal closer |

### 2. Smart Input Detection

The system automatically detects when the user is typing in input fields and does not trigger shortcuts in the following cases:
- `<input>` elements
- `<textarea>` elements
- `<select>` elements
- Elements with `contentEditable="true"`

### 3. Permission-Based Access

Shortcuts respect the RBAC system:
- **Site Admin**: All shortcuts available
- **Org Admin**: All shortcuts available
- **Coach**: All shortcuts available
- **Athlete**: Only help and escape shortcuts available (no Ctrl+M)

---

## Files Created

### Core Implementation

1. **`packages/web/src/lib/hotkeys.ts`** - Keyboard shortcut configuration and utilities
2. **`packages/web/src/hooks/useKeyboardShortcuts.ts`** - React hook for global keyboard shortcuts
3. **`packages/web/src/components/keyboard-shortcuts-dialog.tsx`** - Help dialog component

### Tests

4. **`packages/web/src/lib/__tests__/hotkeys.test.ts`** - 29 unit tests
5. **`packages/web/src/hooks/__tests__/useKeyboardShortcuts.test.ts`** - 22 unit tests
6. **`tests/e2e/keyboard-shortcuts.spec.ts`** - 13 E2E tests

---

## Files Modified

1. **`packages/web/src/components/layout.tsx`**
   - Integrated keyboard shortcuts hook
   - Added measurement modal
   - Added help dialog

---

## Test Results

All tests passing:

```
✓ packages/web/src/lib/__tests__/hotkeys.test.ts (29 tests)
✓ packages/web/src/hooks/__tests__/useKeyboardShortcuts.test.ts (22 tests)

Test Files  2 passed (2)
Tests       51 passed (51)
```

Type checking: Passed

---

## Usage

### For Users

1. **Quick Add Measurement**: Press `Ctrl+M` (or `Cmd+M` on Mac) anywhere in the app
2. **View Keyboard Shortcuts**: Press `?` to see available shortcuts
3. **Close Modals**: Press `Escape` to close any open modal or dialog

### For Developers

See implementation files for adding new shortcuts. The pattern is:

1. Add to `KEYBOARD_SHORTCUTS` array in `hotkeys.ts`
2. Add handler to `useKeyboardShortcuts` hook
3. Add tests

---

## Design Decisions

- **Global Event Listener**: Single listener in Layout for performance and consistency
- **Permission Checking**: Frontend UX + Backend security (defense in depth)
- **Cross-Platform**: Supports both Ctrl (Windows/Linux) and Cmd (Mac)
- **Input Detection**: Prevents shortcuts when typing in forms

---

## Browser Compatibility

Tested in Chrome, Firefox, and Safari. Uses standard KeyboardEvent API.
