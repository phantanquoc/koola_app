## ADDED Requirements

### Requirement: Start popup from the Chat Home add action

The Chat Home `+` dock action SHALL open an in-tree "Bắt đầu mới" dialog (never a native `<Modal>`) offering exactly two actions: **Tạo nhóm** and **Nhắn tin mới**. QR scanning is reached from the standalone QR dock icon next to `+`, not from this dialog. The dialog SHALL be rendered inside the Chat Home content subtree so it covers the conversation list and the sub-tab bar but never the fixed header chrome.

#### Scenario: User opens the popup

- **WHEN** the user presses the `+` dock action on the Chat home header
- **THEN** the "Bắt đầu mới" dialog SHALL fade in and SHALL present two action rows labelled "Tạo nhóm" and "Nhắn tin mới"

#### Scenario: Popup does not cover the header

- **WHEN** the start popup is visible
- **THEN** the wordmark and the command dock of the Chat home header SHALL remain fully visible and their scrim SHALL NOT cover them

### Requirement: Two-stage flow into each destination

Selecting **Tạo nhóm** SHALL close the start popup and present the group creation form in a second stage. Selecting **Nhắn tin mới** SHALL close the start popup and navigate to the Contacts sub-tab.

#### Scenario: User chooses group creation

- **WHEN** the user taps "Tạo nhóm" in the start popup
- **THEN** the start popup SHALL close and the group creation form SHALL appear

#### Scenario: User chooses new message

- **WHEN** the user taps "Nhắn tin mới" in the start popup
- **THEN** the start popup SHALL close and the Contacts sub-tab SHALL become the active Chat sub-tab

### Requirement: Single overlay owner and dismissal semantics

Chat Home SHALL own exactly one overlay at a time from the set {start popup, group form, QR scanner}. While any overlay is open the floating tab dock SHALL be suppressed from the moment the opening press is handled, and the suppression SHALL be released exactly once when the overlay closes or the screen unmounts. Hardware Back and a backdrop press SHALL close the current overlay without navigating away from Chat Home.

#### Scenario: Back closes the start popup

- **WHEN** the start popup is visible and the user presses hardware Back
- **THEN** the start popup SHALL close and Chat Home SHALL remain the active screen

#### Scenario: Back closes the group form

- **WHEN** the group form is visible with no create request in flight and the user presses hardware Back
- **THEN** the group form SHALL close and the start popup SHALL NOT be reopened

#### Scenario: Dock suppression is not delayed

- **WHEN** the user opens any overlay from the Chat home header
- **THEN** the tab dock SHALL already be hidden on the first frame in which the overlay is painted

#### Scenario: Dock returns after close

- **WHEN** the last open overlay closes
- **THEN** the tab dock SHALL become visible again

### Requirement: Group creation form dismissal and draft handling

The group creation form SHALL route every close path (backdrop, ✕ button, hardware Back) through one guarded close. With no create request in flight, closing SHALL discard the draft. While a create request is in flight, closing SHALL first ask the user to confirm discarding the creation; the backdrop and ✕ SHALL remain operable during the request. A successful creation SHALL clear the draft.

#### Scenario: Draft does not leak into the next open

- **WHEN** the user types a group name, selects a participant, closes the form, and opens it again
- **THEN** the name field SHALL be empty and no participant SHALL be selected

#### Scenario: Close during an in-flight create asks first

- **WHEN** a create request is in flight and the user presses the ✕ button or the backdrop
- **THEN** a confirmation SHALL be shown and the form SHALL stay open if the user cancels

#### Scenario: Successful creation clears the draft

- **WHEN** a group is created successfully
- **THEN** the form SHALL close, the draft SHALL be cleared, and the app SHALL open the new conversation

### Requirement: Start popup motion and accessibility

The start popup SHALL enter with the scrim fading in and the panel fading, scaling from 0.94 to 1 and lifting 12dp over `koolaDurations.normal` with `koolaEasing.decelerate`; the group form panel SHALL enter by sliding up over `koolaDurations.slow` with the same easing. Both SHALL exit instantly. When the system reduce-motion setting is enabled both SHALL appear at their final state without animation. The dialog SHALL be marked `accessibilityViewIsModal`, expose a backdrop with the label "Đóng bảng bắt đầu mới", and give every action row a button role and a descriptive label. The `+` dock action SHALL be labelled "Tạo trò chuyện mới" with a hint naming the two actions ("Mở bảng tạo nhóm hoặc nhắn tin mới").

#### Scenario: Reduce motion

- **WHEN** reduce motion is enabled and the user opens the start popup
- **THEN** the scrim and panel SHALL be at full opacity and final position without an animation

#### Scenario: Screen reader labelling

- **WHEN** a screen reader focuses the header add action or any row of the start popup
- **THEN** it SHALL announce "Tạo trò chuyện mới" for the header action and the row's action name for each row
