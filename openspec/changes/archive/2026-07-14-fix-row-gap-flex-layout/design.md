## Context

The Hermes JavaScript engine in React Native 0.76 has a Yoga layout bug where `gap` in `flexDirection:'row'` containers with `flex:1` children causes children to wrap to new lines instead of being evenly spaced horizontally. This is a known platform issue, not a design error.

## Goals

- Eliminate ALL instances of the `gap` + `flex:1` row pattern.
- Preserve identical visual spacing using margin-based alternatives.
- Drive `npm run ui:audit` gapFlexRow count from 28 to 0.

## Non-Goals

- Fixing column-direction gap usage (unaffected by the bug).
- Changing spacing design values.
- Waiting for an RN/Hermes upstream fix.

## Decisions

### Replacement strategy

For each affected container:
1. Remove `gap: N` from the row container style.
2. Add `marginRight: N` (or `marginLeft: N` for RTL) to each child except the last.
3. Add `flexShrink: 0` to children that previously relied on `flex:1` not shrinking in the presence of gap.

### No wrapper component

A utility wrapper was considered but rejected — the fix is mechanical and localized. Adding a wrapper increases indirection without benefit for a one-time cleanup.

### Verification via audit script

The existing `npm run ui:audit` script already detects this pattern. Verification = running the script and confirming gapFlexRow count is 0.

## Verification Strategy

- `npm run ui:audit` → gapFlexRow count === 0
- `cd ChatApp && npm run tsc`
- `cd ChatApp && npm run lint`
- `cd ChatApp && npx jest --passWithNoTests`
- Visual spot-check on affected screens (row items stay horizontal, spacing matches original).
