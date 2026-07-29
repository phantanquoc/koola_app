## Why

The Chat home header currently renders search, QR, and add as three visually disconnected controls with 32dp visual targets. Its five sub-tabs also mix icon families and do not consistently distinguish inactive and active states.

## What Changes

- Place search, QR scanning, and add in one balanced command dock with independent, non-overlapping touch targets.
- Use matching blue outline glyphs for QR and add-circle without divider lines between the three actions.
- Reduce the command dock width with a balanced inset so it does not touch the content edges.
- Adapt the main tab dock's static fill and sheen at lower contrast, without a persistent blue outline or BlurView.
- Keep the command dock perimeter static and neutral, without a persistent blue outline or border animation.
- Replace the five sub-tabs with icon-only inactive/active pairs from the MaterialIcons font already bundled in the Android app.
- Remove the selected icon pill and the separator between the command dock and sub-tabs.
- Add restrained press and selection motion without changing routes, modals, service calls, accessibility labels, or tab behavior.
- Add a short semantic-blue underline beneath the selected sub-tab icon.
- Hide the Chat sub-tab rail while the conversation list scrolls upward and reveal it when the user scrolls back down.
- Re-introduce a one-shot brand-gradient + semantic-primary comet border on the header command dock, gated per caller so only the Chat home screen opts in; other screens using the shared header keep the static neutral perimeter established in task 11.

## Impact

- Mobile UI only: `KoolaHeader`, `ChatHomeScreen`, `ConversationListScreen`, and the shared sub-tab visibility context.
- No backend, API, database, Socket.IO, or navigation contract changes.
- No new runtime dependency.
- Revert boundary: this change directory plus the three mobile UI files and the shared visibility context.
