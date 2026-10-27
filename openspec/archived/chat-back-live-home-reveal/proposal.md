## Why

Backing out of a conversation shows a **frozen screenshot** of Chat Home as the reveal
background. That screenshot was captured at the moment the conversation was opened, so it
also captured the floating bottom tab dock — while the *real* dock is a sibling layer that
stays suppressed for another 280 ms and then slides up from below. The eye therefore sees
the same dock twice, in two different states, and the back transition reads as
"out of sync". The screenshot also freezes a stale conversation list, and its capture can
race the chat card's entry slide and its removal is tied to pop start rather than pop end.

`react-native-screens` only detaches the screen below when the screen above is **not**
translucent. Because Chat is presented as a `push` card, Chat Home's view is removed from
the window for the whole conversation — which is the only reason the screenshot exists.

## What Changes

- Present the Chat route as a translucent screen (`presentation: 'transparentModal'`) so
  Chat Home stays attached to the window for the entire conversation. The back reveal then
  shows the **live** conversation list instead of a screenshot.
- **BREAKING (internal)**: delete the Android back-snapshot subsystem
  (`BackSnapshotController.kt` and its six call sites in `MainActivity`). The card
  shrink / hold / restore machinery is unchanged.
- The bottom tab dock no longer slides up from below when returning from a fullscreen
  route. It fades in over ~80 ms with no translation.
- The dock's return is scheduled from the real `transitionEnd` (`closing: true`) event
  instead of a hard-coded 280 ms timer after `beforeRemove`, with a fallback timer for the
  case where the event never arrives.
- Remove two dead navigation options (`cardStyle`, `detachPreviousScreen`) that belong to
  `@react-navigation/stack` and are ignored by `@react-navigation/native-stack` v7, along
  with the incorrect comments that claim they prevent Fabric child-count desyncs.

## Capabilities

### New Capabilities

- `chat-back-transition`: how leaving a conversation reveals Chat Home — the reveal surface
  (live screen, not a captured frame), the card shrink/slide choreography handoff, and the
  coordination of the floating bottom dock's return with the native pop transition.

### Modified Capabilities

<!-- None. No existing capability specifies back-transition reveal behaviour or dock return
     timing; `mobile-navigation-shell` covers dock geometry, theming and reachability only. -->

## Impact

**Mobile (React Native)**

- `ChatApp/src/navigation/ChatTabStack.tsx` — Chat route presentation, dead options removed.
- `ChatApp/src/navigation/MainNavigator.tsx` — dock reveal animation (opacity only, ~80 ms),
  shared by every fullscreen route.
- `ChatApp/src/screens/chat/ChatScreen.tsx` — dock suppression release driven by
  `transitionEnd` instead of a timer.

**Android native**

- `ChatApp/android/app/src/main/java/com/chatapp/BackSnapshotController.kt` — deleted.
- `ChatApp/android/app/src/main/java/com/chatapp/MainActivity.kt` — snapshot field,
  registration and the three install/uninstall call sites removed; `CARD_NATIVE_ID`
  constant moved into `MainActivity`'s companion object.

**Behavioural reach**

- Dock return timing/animation changes for **every** fullscreen route (Profile,
  ShoppingProductDetail, MomentViewer, …), not only Chat.
- Chat's push/pop, predictive-back gesture, keyboard resize and safe-area insets all now
  run under a translucent presentation and must be re-verified on a device.

**Not changed**

- Card shrink geometry (`MAX_SHRINK`, `QUICK_MS`, `RESTORE_MS`), the
  `react-native-screens` animation XML patch, and all chrome components
  (`LightFieldBackground`, `ChromeGlassSheet`, `ChromeHeaderBox`).
