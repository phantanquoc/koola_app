## 1. Governance and Batch Safety

- [ ] 1.1 Announce each implementation batch with scope, non-scope, risk level, changed-file target, and verification plan
- [ ] 1.2 Keep each batch limited to one feature area or shared primitive area so regressions can be reverted independently
- [ ] 1.3 Request explicit approval before adding any visual dependency such as SVG/icon/chart/haptic libraries
- [ ] 1.4 Report changed files, verification result, and known limitations at the end of each user-visible batch ← (verify: every completed batch follows the incremental review/revert protocol in design.md and specs/uiux-modernization-governance/spec.md)

## 2. Mobile Koola UI Foundation

- [x] 2.1 Audit `ChatApp/src/ui` primitives and identify low-risk foundation fixes
- [x] 2.2 Add Koola button accessibility role/state hardening without changing visual size or behavior
- [x] 2.3 Add Koola icon button disabled accessibility state without changing default size
- [x] 2.4 Set `underlineColorAndroid="transparent"` in `KoolaTextInput`
- [x] 2.5 Run `cd ChatApp && npm run tsc` after foundation patch ← (verify: Koola primitive changes are additive, TypeScript passes, and no feature behavior changed)
- [ ] 2.6 Defer new semantic tokens until a screen-level batch proves the need

## 3. Moments Entry and Ring Experience

- [x] 3.1 Improve `MomentsScreen` loading, error, empty, and friend-empty copy/actions without changing service behavior
- [x] 3.2 Improve `MomentsScreen` header hierarchy and create-action accessibility hint
- [x] 3.3 Run `cd ChatApp && npm run tsc` after `MomentsScreen` polish
- [x] 3.4 Improve `MomentRing` own/add/unseen/seen visual clarity without adding a gradient dependency
- [x] 3.5 Improve `MomentRing` accessibility labels and hints for own story, add story, unseen stories, and seen stories
- [ ] 3.6 Smoke test Moments entry: empty feed, own ring create, friend ring open, pull-to-refresh, own long-press menu ← (verify: Moments entry requirements in specs/moments-stories/spec.md pass without media/viewer lifecycle changes)

## 4. Moments Viewer, Composer, and Music Picker

- [ ] 4.1 Audit `MomentViewerScreen`, `MomentComposerScreen`, and `MusicPicker` before making viewer/composer/music changes
- [ ] 4.2 Improve viewer safe-area, close/back affordance, loading, and error presentation without changing timer or playback semantics
- [ ] 4.3 Improve composer step hierarchy and publish-state clarity without changing story DTO semantics
- [ ] 4.4 Improve music picker search/loading/empty/selected/preview states without changing music API semantics
- [ ] 4.5 Verify viewer/composer/music lifecycle: hold-to-pause resume, close stops media, rapid open/close, preview stops on close/change ← (verify: no audio/video continues after dismiss and specs/moments-music-library/spec.md lifecycle scenarios pass)

## 5. Chat UX Clarity

- [ ] 5.1 Audit `ChatScreen`, `ChatComposer`, `useMessages`, and related presentational components before changing chat UI
- [ ] 5.2 Improve composer action clarity while preserving uncontrolled input behavior
- [ ] 5.3 Improve visible disabled/loading/unavailable action states in composer controls
- [ ] 5.4 Improve supported sending/offline/failed visual states only where existing message data exposes those states
- [ ] 5.5 Verify chat open/back, keyboard open/close, send responsiveness, and absence of pop-back flicker ← (verify: `freezeOnBlur` remains effective and `ChatComposer` remains uncontrolled)

## 6. Navigation Shell and Global Mobile Polish

- [ ] 6.1 Audit `MainNavigator`, `ChatTabStack`, `KoolaHeader`, `ProfileScreen`, and `GroupInfoScreen` before global shell changes
- [ ] 6.2 Preserve route structure, chat `freezeOnBlur`, and Moments modal/fullscreen modal presentation while polishing headers
- [ ] 6.3 Remove or contain diagnostic visual artifacts only after confirming tab dock behavior remains stable
- [ ] 6.4 Verify tab dock suppression, fullscreen route behavior, chat pop-back, and no `BlurView` reintroduction ← (verify: navigation safety non-goals in design.md remain intact)

## 7. Admin Web UX and Trust Workflow

- [ ] 7.1 Audit admin page-level patterns in `AppLayout`, `DashboardPage`, `UsersPage`, `BusinessesPage`, `LoginPage`, and `index.css`
- [ ] 7.2 Extract small admin primitives for page header, panel, metric card, status badge, empty/loading/error state, and table shell where patterns repeat
- [ ] 7.3 Improve dashboard operational hierarchy so pending work and recovery states are obvious
- [ ] 7.4 Improve business verification queue trust signals, status clarity, reject reason flow, and duplicate-submit protection without changing admin APIs
- [ ] 7.5 Verify admin login, dashboard loading/error, users table, businesses queue, responsive layout, and keyboard/accessibility basics ← (verify: admin-web-app and admin-business-verification spec scenarios pass without heavy UI framework adoption)

## 8. Accessibility, Performance, and Regression Gates

- [ ] 8.1 Apply accessibility checklist to touched mobile UI: roles, labels, disabled/busy states, 44px target review, contrast, and reduced-motion awareness
- [ ] 8.2 Apply accessibility checklist to touched admin UI: focus visibility, keyboard navigation, labels, dialogs, and table semantics
- [ ] 8.3 Run relevant TypeScript/build checks after each implementation group and report failures honestly
- [ ] 8.4 Perform release-like smoke testing for high-risk chat and Moments media batches when those batches are implemented
- [ ] 8.5 Capture before/after screenshots or manual visual notes for major user-visible batches ← (verify: visual improvements remain reviewable and regression-prone flows have documented checks)
