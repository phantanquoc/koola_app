## 1. Analysis

- [x] 1.1 Read Koola UI DNA and current header/tab implementation
- [x] 1.2 Run GitNexus impact analysis for modified symbols

## 2. Header

- [x] 2.1 Integrate QR as a distinct trailing action in the search surface
- [x] 2.2 Give search, QR, and add non-overlapping 48dp touch targets
- [x] 2.3 Preserve search, QR, and group-create callbacks

## 3. Sub-tabs

- [x] 3.1 Replace mixed sub-tab icons with coherent inactive/active pairs
- [x] 3.2 Update active indicator, spacing, and label hierarchy using semantic tokens
- [x] 3.3 Preserve swipe, lazy loading, reset-to-messages, and accessibility states

## 4. Verification

- [x] 4.1 Run mobile TypeScript check
- [x] 4.2 Run mobile lint
- [x] 4.3 Run focused feature-availability test
- [x] 4.4 Run GitNexus detect_changes and confirm expected scope
- [ ] 4.5 Review the result on an Android viewport with the user

## 5. User feedback iteration

- [x] 5.1 Split universal search and compact actions into two sibling docks
- [x] 5.2 Match QR and add with same-size blue outline icons
- [x] 5.3 Apply static faux-glass layers derived from the main tab dock
- [x] 5.4 Re-run mobile, OpenSpec, emulator, and GitNexus verification

## 6. Unified command dock iteration

- [x] 6.1 Merge search, QR, and add into one command dock
- [x] 6.2 Replace the circled add glyph with a plain matching action glyph
- [x] 6.3 Reduce rim, tint, and sheen contrast while preserving press feedback
- [x] 6.4 Re-run mobile, OpenSpec, emulator, and GitNexus verification

## 7. Compact action treatment iteration

- [x] 7.1 Replace the plain add glyph with `add-circle-outline`
- [x] 7.2 Remove divider lines between search, QR, and add-circle
- [x] 7.3 Inset the command dock to reduce its width
- [x] 7.4 Re-run mobile, OpenSpec, emulator, and GitNexus verification

## 8. Icon fidelity correction

- [x] 8.1 Match the add action to the requested outlined plus-circle glyph
- [x] 8.2 Re-run mobile TypeScript, lint, emulator, and scope verification

## 9. Animated border iteration

- [x] 9.1 Add one rounded-rectangle stroke runner with a fading tail
- [x] 9.2 Keep the animated layer non-interactive and cancel it on unmount
- [x] 9.3 Verify animation on Android and re-run project checks

## 10. Comet rim refinement

- [x] 10.1 Add a soft halo and overlapping same-path fade layers
- [x] 10.2 Slow the animation to a restrained 5.4-second cycle
- [x] 10.3 Verify the refined animation on Android and re-run project checks

## 11. Animated border removal

- [x] 11.1 Remove the animated blue rim, halo, and fading stroke layers
- [x] 11.2 Remove unused Reanimated code while preserving the static neutral dock
- [x] 11.3 Re-run mobile, OpenSpec, emulator, and scope verification

## 12. Icon-only sub-tab iteration

- [x] 12.1 Remove visible sub-tab labels and the selected background pill
- [x] 12.2 Add press compression and selected glyph rebound motion
- [x] 12.3 Remove the separator between the command dock and sub-tab bar
- [x] 12.4 Verify Android layout, interaction, accessibility, and project checks

## 13. Compact icon rail

- [x] 13.1 Reduce visual vertical padding around the icon row
- [x] 13.2 Preserve 48dp effective touch targets with hit slop
- [x] 13.3 Verify the compact rail on Android and re-run project checks

## 14. Scroll-responsive sub-tab rail

- [x] 14.1 Share a Reanimated visibility value between the Messages list and sub-tab bar
- [x] 14.2 Hide the rail on upward scroll and reveal it on downward scroll/top return
- [x] 14.3 Reset the rail to visible when switching to another sub-tab
- [x] 14.4 Verify scroll transitions on Android and re-run project checks

## 15. Selected icon underline

- [x] 15.1 Add an animated semantic-blue underline for the selected icon
- [x] 15.2 Replace messages and contacts glyph pairs with the refreshed MaterialIcons choices
- [x] 15.3 Verify active indicators and project checks

## 16. Scroll animation smoothing

- [x] 16.1 Collapse the rail to zero after a stable hide transition
- [x] 16.2 Add directional hysteresis to ignore small scroll jitter
- [x] 16.3 Verify the smoother transition and project checks
