## Context

`ChatTabStack` renders a shared `NotchHeader` as an absolutely-positioned sibling of `Stack.Navigator` (`ChatTabStack.tsx:32`), with `zIndex: 10` (`NotchHeader.tsx:139`). Because it sits outside the navigator, it stays fixed across stack pushes — deliberate, so the notch band does not slide during transitions. The consequence is that it paints over every screen in the stack.

Every other screen in the stack compensates by reserving the band's height before laying out content:

| Screen | How it reserves space |
|---|---|
| `ChatHomeScreen.tsx:616` | `insets.top + NOTCH_WING_INSET + NOTCH_HEADER_CONTENT_H` |
| `SettingsScreen.tsx:53` | same constants inline |
| `ShoppingHomeScreen.tsx:498` | same constants inline |
| `UpgradeScreen.tsx:43` | `getNotchHeaderHeight(insets.top, true) + koolaSpacing.sm` |
| `SettingsDetailScreen.tsx:83` | `getNotchHeaderHeight(insets.top, true) + koolaSpacing.sm` |

`ChatScreen` does not. It renders `ChatHeader` from the top of `styles.container` (`ChatScreen.tsx:936-948`), and `ChatHeader` applies only `paddingTop: insets.top + 8` (`ChatHeader.tsx:48`). The band occupies `insets.top` → `insets.top + 28` with a frosted background plus the KOOLA wordmark; `ChatHeader`'s avatar row starts at `insets.top + 8`. The overlap is real and visible: the wordmark paints across the avatar and back button. `OfflineBanner`, rendered immediately before the header (`ChatScreen.tsx:938`, `marginTop: 8`), falls inside the same band and is obscured by the same cause.

`PersonalTabStack` already solved the "pushed screen needs a different band" problem with a takeover pattern: `PersonalHeaderContext` holds `{config, setConfig}`, `usePersonalNavHeader(title, onBack)` registers config via `useFocusEffect` and clears it on cleanup, and `PersonalTabStack` feeds `title`/`onBack` into `NotchHeader`, which switches to a taller back+title band when `onBack` is present (`NotchHeader.tsx:36-87`). `ChatTabStack` has no equivalent.

## Goals / Non-Goals

**Goals:**
- Chat's header content is never obscured by the shared band, and never obscures it — there is exactly one header band at the top of the Chat screen.
- Chat's header reaches parity with the removed `ChatHeader`: back, avatar with online dot, name, status line, audio call, video call, and tap-to-open-conversation-info.
- The band returns to the KOOLA wordmark whenever Chat is not the focused screen.
- The reserved-height helper states its variant explicitly rather than encoding it as a boolean.
- `OfflineBanner` and `PinBanner` land below the band.

**Non-Goals:**
- `GroupInfoScreen`'s equivalent header-obscuring defect (`GroupInfoScreen.tsx:111`) — same class of bug, explicitly deferred by the user.
- `ProfileScreen.tsx:124` and `UniversalSearchScreen.tsx:151`, which draw their own headers.
- Any change to message flow, socket handling, SQLite reads, outbox, or the composer.
- Any change to color, typography, or token values. This is a structural relocation of header content.
- Pixel-level tuning of the band height on a real device — computed from existing tokens here, confirmed on hardware as a separate open task.

## Decisions

### D1 — New `ChatHeaderContext` rather than reusing `PersonalHeaderContext`

`PersonalHeaderContext` is provided by `PersonalTabStack` and carries only `{title, onBack}`. Chat lives in a different stack (so it would never receive that provider) and needs a richer payload. A parallel `ChatHeaderContext` in `ChatApp/src/navigation/` keeps the two stacks independent and the shape of each config honest.

*Alternative considered:* generalize `PersonalHeaderContext` into one shared header context for both stacks. Rejected for now — it would widen the config type to a union covering both stacks' needs and force `PersonalTabStack` to re-render on a shape it does not use. Two small, precise contexts are clearer than one permissive one.

### D2 — Config carries structured data, never `ReactNode`

The context value carries `{title, status, avatarKey, onBack, onHeaderPress, onStartCall}` — plain data and callbacks. Passing a rendered element would hand the provider a fresh object identity on every `ChatScreen` render, re-rendering the band continuously. `NotchHeader` owns the rendering; `ChatScreen` owns only the values.

### D3 — Callbacks stabilized through refs

The registration hook follows `PersonalHeaderContext.tsx:27-28`: keep the latest callbacks in refs, and register wrappers that read `ref.current`. Without this, a callback whose identity changes each render would re-run the focus effect and re-set config in a loop. The focus effect's dependency list must not include raw callback identities.

### D4 — `NotchHeader` gains a third branch; `getNotchHeaderHeight` takes an explicit variant

`NotchHeader` currently branches on `if (onBack)`. A chat variant is added as a third branch alongside it, and a new content-height constant is exported for it. `getNotchHeaderHeight`'s `nav?: boolean` becomes an explicit variant union (`'wordmark' | 'nav' | 'chat'`) — a boolean cannot express three states, and a second boolean would allow nonsensical combinations. Exactly two call sites pass `true` today (`UpgradeScreen.tsx:43`, `SettingsDetailScreen.tsx:83`); both are updated in this change.

*Alternative considered:* keep the boolean and add a separate `chat?: boolean`. Rejected — two booleans permit four states for three real variants, and the invalid combination would have to be handled or silently ignored. No backward-compatibility shim is added; the union is the only supported signature.

### D5 — Band height derived from existing tokens

The chat band must fit a 38px avatar, a name line plus a 16px-minimum status line, and two 40px icon buttons. The content height is computed from `koolaSpacing` (`ChatApp/src/ui/theme.ts:137`) and those component sizes rather than a hand-picked number, so the band stays consistent with the rest of the chrome and moves with token changes.

### D6 — `ChatHeader.tsx` is deleted, not left in place

Its only importer is `ChatScreen.tsx:27`, and no test references it (verified by grep). Once its visual content moves into the chat variant, leaving the file would leave dead code that looks live. The visual details it owns and that must be preserved: avatar 38px, online dot 11px positioned bottom-right of the avatar, status line with `minHeight: 16` reserving space so late-arriving status does not shift layout (`ChatHeader.tsx:72-83`), and two `KoolaIconButton`s at `size={40}`.

### D7 — State stays where it is

`useChatHeaderState` (`ChatScreen.tsx:209-223`) continues to produce `chatTitle`, `otherUserStatus`, `otherAvatarKey`, `handleHeaderPress`, and `useCallInitiation` continues to produce `handleStartCall`. Only the render location moves. No hook is relocated or rewritten.

## Risks / Trade-offs

- **`freezeOnBlur: true` on the Chat screen may interfere with config release.** `ChatTabStack.tsx:49` sets `freezeOnBlur: true` for Chat; no `PersonalTabStack` screen does, so the reference pattern has never been exercised under freeze. If freezing suspends the subtree before `useFocusEffect` cleanup runs, the band could stay stuck showing the chat header after navigating to `GroupInfo`/`Profile`/`UniversalSearch`. → Must be actively verified during implementation, not assumed. If cleanup does not fire, the release must be driven by a mechanism that survives freeze (e.g. releasing on navigation-state change rather than relying solely on effect cleanup) — a real fix, not a workaround.
- **Changing `getNotchHeaderHeight`'s signature reaches outside Chat.** Two screens in `PersonalTabStack` consume it. → Full `tsc --noEmit` across `ChatApp` is required; a missed call site is a type error, not a silent runtime bug.
- **The frosted band renders over the chat background.** The band has a translucent base plus a softened bloom layer; the chat surface differs from the scroll surfaces the band was tuned against. → Visual result is confirmed on a real device as an explicit open task rather than declared correct from code.
- **Band height is computed, not measured.** Token math can still land a few pixels off against real status-bar insets and font metrics. → Left as an untick-ed device-check task by explicit user decision; prior header/notch work on this project (`chat-home-chrome-redesign`, `gray-canvas-background`) needed on-device tuning to settle.

## Open Questions

- Does `useFocusEffect` cleanup fire before `freezeOnBlur` suspends the Chat subtree? Resolved during implementation by direct verification (see first risk above), not left to assumption.
