## 1. Capture the pre-change reference

- [x] 1.1 Confirm the device is connected (`adb devices` shows `7999fd53`), Metro is serving on 8081, and `adb reverse` tunnels for 8081/3000/9000 are present; re-establish tunnels if the transport id changed
- [x] 1.2 Re-measure ChatScreen on conversation `69d38d516de36efd94b4edf1` with the canonical gesture (8 alternating `input swipe 540 1700 540 900 250` / `input swipe 540 900 540 1700 250` pairs, 0.35 s apart, `dumpsys gfxinfo com.chatapp reset` first), discard the first two samples, and record `Janky frames (legacy)` plus framestats over-budget count — this re-confirms the 38–43 % starting point on the current tree rather than trusting the earlier figure ← (verify: measurement used the automated gesture not a hand scroll; percentiles read from raw gfxinfo/framestats, not from the summary output of `scripts/measure-chat-scroll.sh` whose percentile parser is broken)
      RESULT: 7 valid cycles, warm-up 1–2 discarded. Janky (legacy) cycles 3–7 = 37.86 / 42.62 / 44.55 / 38.60 / 47.03 % → mean **42.13 %**. framestats over-8.3 ms = 36.1–64.2 %; maxTotal up to 528.80 ms. `draw→sync` p99 35.26–121.09 ms; `anim→trav` p99 9.33–15.51 ms. Pinned-bottom view count **324 views, identical in 7/7 cycles** — the deterministic metric.
      Two measurement hazards found and handled: (a) a swipe starting on an image bubble can degrade into a tap and open the image viewer (~37 views), which fakes a low number — every cycle is now validated by composer presence and discarded if contaminated; (b) this device's framestats header has 24 columns, so the circulated fixed indices (`FrameCompleted`=18) read `DequeueBufferDuration` and yield zero rows — the parser resolves columns by header name.
- [x] 1.3 Capture reference screenshots before any edit: incoming text bubble, outgoing text bubble, image bubble, video bubble, a message with a reaction, an outgoing message showing its delivery tick, and the context menu opened by long-press
      Captured to `/tmp/koola_p2b_shots/`: `before_bottom.png` (incoming + outgoing text bubbles, delivery ticks, time rows), `before_media.png` (image bubbles with rounded corners + time scrim), `before_longpress.png` (context menu: emoji row + Sao chép / Chuyển tiếp / Ghim / Xóa). No message with an existing reaction and no video message was present in the visible range of this conversation, so those two reference shots could not be taken — noted rather than faked.
      Long-press is reproducible via `input swipe X Y X Y 900` (zero-distance swipe with a 900 ms hold); a plain `input tap` cannot express hold duration.

## 2. Reduce the row view tree

- [ ] 2.1 In `ChatApp/src/screens/chat/components/MessageItem.tsx`, replace the rendering of GiftedChat's `Bubble` with the row's own minimal tree, keeping `Message` as the outer component so left/right container alignment, same-sender bottom margin, avatar gating, and the system-message branch continue to come from the library
- [ ] 2.2 Reproduce the bubble geometry exactly: start/end alignment per position, 60 dp inset on the opposite side, 20 dp minimum height, bottom-aligned content, and the metadata strip laid out horizontally justified to start for incoming and end for outgoing
- [ ] 2.3 Render bubble content in the fixed order — leading custom view, image, video, audio, text, trailing custom view — retaining the audio slot even though audio messages are not sent today
- [ ] 2.4 Render message text through GiftedChat's `MessageText` (imported from the same barrel as `Message`), passing the existing left/right text styles so link detection, scheme repair, and link-open fallback are preserved ← (verify: `MessageText` is imported from `react-native-gifted-chat`, not reimplemented; a URL and a phone number still render as tappable links)
- [ ] 2.5 Keep the existing per-row treatments unchanged: `bubbleOuter` plus `isHighlighted` highlight, the story-reply card above the bubble, the tail-radius selection driven by `isLastInGroup`, the media time scrim versus text time row, the self-drawn delivery tick row, the failure label, and `ReactionDisplay` beneath the bubble
- [ ] 2.6 Mount the retry `TouchableOpacity` and the `failedBubbleWrapper` `View` only when the message is in the failed state, so a normal message no longer carries two layers whose props are `undefined`

## 3. Re-host the long-press gesture

- [ ] 3.1 Host the long-press gesture on the row's own wrapper so it no longer depends on the touchable that lived inside `Bubble`, passing the current message to the existing screen-level handler (which ignores its context argument)
- [ ] 3.2 Ensure the long-press region covers the bubble so pressing anywhere on a message opens the menu, matching the previous hit area
- [ ] 3.3 Ensure a failed message keeps both behaviors on the same subtree: single tap triggers retry, long press opens the context menu
- [ ] 3.4 Ensure tapping a detected link inside the message body runs the link action without also opening the context menu, and that long-pressing a system message opens nothing ← (verify: long-press fires from the row wrapper — this is the change's highest-risk point because a broken gesture produces no error and no log, so inspection alone cannot confirm it)

## 4. Remove the duplicate image rounding

- [ ] 4.1 In `ChatApp/src/components/MediaImage.tsx`, remove the `borderRadius` applied to the animated image, relying on the parent container's existing radius plus `overflow: 'hidden'` ← (verify: cached and freshly downloaded images still render with rounded corners; the `WrappingUtils: Don't know how to round that drawable` warnings no longer appear in logcat during scroll)

## 5. Tests

- [ ] 5.1 Add a test asserting the retry affordance and failed-state wrapper are absent for a normal message and present for a failed message
- [ ] 5.2 Add a test asserting the long-press handler is invoked with the current message when the row wrapper receives a long press, and is not invoked for a system message
- [ ] 5.3 If any prop was added to or removed from `MessageItemProps`, declare it in the `messageItemEquality.ts` ledger as either compared or explicitly-not-compared with a reason — do not bypass the guard with a cast or an index signature ← (verify: `tsc --noEmit` passes with the ledger intact and no `as unknown as` cast or index signature was introduced)

## 6. Gates and measurement

- [ ] 6.1 Run `npx tsc --noEmit` from `ChatApp` and confirm 0 errors
- [ ] 6.2 Run `npx jest` from `ChatApp` and confirm at least 878 passing tests across 56 suites with no suite failing
- [ ] 6.3 Run `npx eslint` from `ChatApp` and confirm no new errors versus the 0-error / 304-warning baseline
- [ ] 6.4 Reload the app on device, re-measure with the identical gesture from task 1.2, and record the after figures alongside the before figures ← (verify: before and after were measured on the same device, build type, conversation, and gesture, taken close together in time so thermal drift does not distort the comparison)
- [ ] 6.5 Capture after screenshots matching every reference shot from task 1.3 and compare them for visual drift — bubble width and alignment, tail corners, tick, reaction position, media time scrim, and the context menu
- [ ] 6.6 Report the result honestly against the debug target of ≤8 %: state the measured before and after numbers, and do not claim sub-5 % from a debug build — record that sub-5 % confirmation requires a `perf` build and remains outstanding ← (verify: no performance claim appears without a matching before/after measurement; the debug-versus-perf distinction is stated explicitly rather than blurred)
