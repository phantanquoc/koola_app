## Why

React Native 0.76 with Hermes on Android has a known layout bug: `gap` in `flexDirection:'row'` containers with `flex:1` children silently drops children to new lines instead of spacing them horizontally. This affects 28 files across the mobile codebase as reported by `npm run ui:audit` (gapFlexRow bucket). The visual result is broken row layouts where items stack vertically or wrap unexpectedly.

## What Changes

- Replace `gap` with explicit `marginRight`/`marginLeft` spacing in all `flexDirection:'row'` containers that have `flex:1` children.
- Add `flexShrink:0` where needed to prevent unintended shrinking after gap removal.
- Drive the gapFlexRow count in `npm run ui:audit` to zero.

## Capabilities

### New Capabilities
- `mobile-layout-integrity`: Row containers SHALL NOT combine `gap` with `flex:1` children due to the Hermes RN 0.76 layout bug.

### Modified Capabilities

None.

## Impact

- 28 files under `ChatApp/src/screens/` and `ChatApp/src/components/` (listed in tasks).
- Pure style changes — no business logic, API, or navigation behavior changes.
- No backend changes.

## Non-Goals

- Removing `gap` from column layouts or row layouts without `flex:1` children (those work correctly).
- Upgrading React Native or Hermes to fix the root cause.
- Changing the visual design or spacing values — only the CSS mechanism changes.
