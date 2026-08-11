## ADDED Requirements

### Requirement: Chat message rows stay within a native view budget
Each rendered chat message row SHALL build no more than 12 native views for a plain text message carrying no reactions, no delivery ticks, and no media. Layers that render nothing in the common case SHALL NOT be mounted in the common case.

The budget exists because Fabric's shadow-tree commit cost scales with mounted view count, and commit (`draw→sync`) was measured as the dominant cost of chat scroll jank at 40.45 / 48.66 / 51.22 ms on slow frames versus under 3 ms for every phase other than `anim→trav`.

#### Scenario: Plain text message is rendered
- **WHEN** an incoming or outgoing text message with no reactions and no media is rendered
- **THEN** the row SHALL NOT mount a retry-affordance touchable
- **AND** the row SHALL NOT mount a failed-state wrapper view
- **AND** the row SHALL NOT mount structurally empty wrapper views that apply no style and handle no gesture

#### Scenario: Failed message is rendered
- **WHEN** a message is in the failed state
- **THEN** the retry-affordance touchable SHALL be mounted and SHALL invoke the retry handler when pressed
- **AND** the failed-state wrapper view SHALL be mounted and SHALL carry its danger-colored border treatment
- **AND** the failure label SHALL remain visible beneath the bubble

#### Scenario: Message gains a reaction
- **WHEN** a reaction is added to a previously reaction-free message
- **THEN** the reaction display SHALL mount beneath the bubble
- **AND** the surrounding row structure SHALL NOT gain additional wrapper layers

### Requirement: Chat scroll smoothness is measured against a recorded device baseline
Chat scroll performance SHALL be verified with the adb `gfxinfo` framestats method after implementation, using the same automated gesture as the recorded baseline so that gesture force is identical across runs. A hand-performed scroll SHALL NOT be accepted as evidence, because swipe velocity cannot be reproduced by hand.

Improvement SHALL NOT be claimed without both a before and an after measurement taken on the same device, same build type, same conversation, and same gesture.

#### Scenario: Post-implementation measurement is taken
- **WHEN** ChatScreen scroll is measured on device `7999fd53` with `dumpsys gfxinfo com.chatapp reset`, followed by 8 alternating `input swipe 540 1700 540 900 250` / `input swipe 540 900 540 1700 250` pairs with 0.35 s between swipes, then a framestats readout
- **THEN** the `Janky frames (legacy)` percentage SHALL be recorded, discarding the first two samples as warm-up noise
- **AND** the debug-build result SHALL reach parity with the conversation-list reference of 7.83–7.99 %, meaning 8 % or lower

#### Scenario: Sub-5% target is claimed
- **WHEN** a janky-frame result below 5 % is to be claimed
- **THEN** the measurement SHALL come from a `perf` or release build, NOT a debug build
- **AND** the reason SHALL be recorded: the already-lean conversation list still measures 7.83 % on a debug build, so 5 % lies below the dev-bundle floor and is unreachable there by view reduction alone

#### Scenario: Percentile values are read from framestats output
- **WHEN** percentile figures are reported
- **THEN** they SHALL be read from raw `dumpsys gfxinfo` output or parsed framestats rows
- **AND** they SHALL NOT be taken from `scripts/measure-chat-scroll.sh` summary output, whose percentile parser captures the label digits (for example reporting 50 ms for the "50th percentile" line) instead of the value

### Requirement: Falsified jank hypotheses are recorded to prevent re-investigation
The five hypotheses disproved during this investigation SHALL be recorded with their disproving evidence, so later work does not re-derive them.

#### Scenario: A future investigation considers image decoding
- **WHEN** full-resolution image decoding is proposed as a jank cause
- **THEN** the record SHALL show it was disproved: the logged dimensions originate from `SkJpegCodec::ReadHeader`, which only reads headers and runs on background threads, while `Slow bitmap uploads` counted 0 and no GC pause appeared

#### Scenario: A future investigation considers media rows
- **WHEN** images or videos are proposed as the differentiator
- **THEN** the record SHALL show it was disproved: a text-only region measured 43.12 % against 38–53 % for a media region

#### Scenario: A future investigation considers per-row day-position sorting
- **WHEN** GiftedChat `Item`'s per-frame day-position sort is proposed as the dominant cost
- **THEN** the record SHALL show the cost model was disproved by experiment: a 24-message / 8-day conversation measured 37.89 % against 39.21 % for a 119-message / 25-day conversation, so the result does not scale with day count

#### Scenario: A future investigation considers unbounded view accumulation
- **WHEN** `removeClippedSubviews: false` is proposed to cause unbounded view growth
- **THEN** the record SHALL show it was disproved: view count decreased from 306 to 255 while scrolling deeper, so rows are being unmounted normally

#### Scenario: A future investigation considers the input-latency counter
- **WHEN** the gfxinfo `High input latency` counter is proposed as the cause
- **THEN** the record SHALL show it was disproved: the conversation list reported a higher count (5899 versus 4036) while measuring roughly five times less jank
