# EditProfileScreen - Design Analysis & Redesign Report

**Date:** 2026-06-11
**Screen:** `ChatApp/src/screens/main/EditProfileScreen.tsx`
**Status:** Critical UI bugs + redesign proposal

---

## Executive Summary

1. **Tab bar overlay bug** -- EditProfileScreen lives inside `PersonalTabStack` (a native stack nested within a bottom tab), but the floating tab bar dock is never hidden for PersonalTab child screens. The `shouldHideTabBar()` function in `MainNavigator.tsx` only hides the tab bar for `ChatTab` fullscreen routes.
2. **Cover band stretching** -- The screen has `headerShown: true` set in PersonalTabStack, which adds a native navigation header. Simultaneously, `EditProfileScreen` wraps its own `SafeAreaView` with `flex: 1`. The native header + SafeAreaView + the floating tab bar compete for vertical space, causing layout collapse on shorter devices (content appears compressed, cover looks disproportionately large relative to visible scrollable area).
3. **Avatar displacement** -- The `-56` marginTop on `avatarWrapper` is correct mathematically (112/2 = 56) but when the native header eats ~56px and the tab bar occludes ~86px bottom, the visible ScrollView content height shrinks dramatically, making the cover band appear to fill 60-70% of the remaining viewport.
4. **Bottom content hidden** -- The scroll's `paddingBottom: 32` is insufficient; the floating tab dock occupies ~86px. Sections "TAI KHOAN" and "CA NHAN" are scrolled behind the dock with no clearance.
5. **Double SafeArea** -- Native stack `headerShown: true` already handles top safe area. The screen's own `SafeAreaView` adds redundant top inset on devices with notch, further compressing content.

---

## A. Root Cause Analysis

### Bug 1: Tab Bar Showing on Edit Screen

**Location:** `MainNavigator.tsx` lines 100-106

```
function shouldHideTabBar(route): boolean {
  if (route.name !== 'ChatTab') return false;  // <-- ONLY checks ChatTab
  ...
}
```

The custom tab bar (`CustomKoolaTabBar`) only hides itself when the focused route inside `ChatTab` is `Chat`, `MomentViewer`, or `MomentComposer`. It NEVER hides for any `PersonalTab` child screen.

**Impact:** EditProfileScreen always renders with the floating dock overlaying ~86px of bottom content.

### Bug 2: Cover Band Appearing Stretched (~70% viewport)

This is a **perceptual** bug caused by stacking layout constraints:

```
+----------------------------+  <- Status bar (device safe area top)
| Native Stack Header ~56px  |  <- headerShown: true in PersonalTabStack
+----------------------------+
| SafeAreaView top inset     |  <- REDUNDANT (double safe-area)
+----------------------------+
| Cover Band: 160px          |  <- Fixed height, correct
| Avatar overlap: -56px      |
| Content...                 |
|                            |
+----------------------------+
| HIDDEN BY TAB DOCK ~86px   |  <- Floating dock with no scroll offset
+----------------------------+
```

Available viewport on a Pixel 7 (412x732dp effective):
- Total: 732dp
- Status bar: ~24dp
- Native header: ~56dp
- Double SafeArea top: ~24dp (on notch devices)
- Tab dock: ~86dp
- **Remaining for ScrollView: ~542dp** (or ~518dp with notch)

Cover band at 160px occupies **29-31%** of available scroll height. But since sections below are partially hidden behind the dock, visually the cover appears to dominate. On smaller devices (360x640), this ratio increases to ~38%.

### Bug 3: Avatar Pushed Down

The `avatarWrapper` with `marginTop: -56` IS correctly positioned relative to the cover band. The visual issue is that with content compressed, the avatar appears at the boundary of visible area. This is a secondary effect of Bugs 1 and 2.

### Bug 4: Missing Bottom Padding

```javascript
scroll: { paddingBottom: 32 }  // Should be at least 86+16 = 102
```

The screen does not call `useTabBarBottomInset()` like other screens (e.g., `SettingsScreen` uses it). The `CA NHAN` section gets hidden under the floating dock.

---

## B. Layout Redesign Options

### Option A: Compact List-Style (No Cover)

Removes the cover banner entirely. Prioritizes form efficiency and content visibility.

```
+------------------------------------+
| [<] Chinh sua ho so          [Save]|  <- Native header with save action
+------------------------------------+
|                                    |
|         [====AVATAR====]           |  96px centered
|         [  camera icon  ]          |
|                                    |
|   Ten hien thi                     |  <- Inline display under avatar
|   @username                        |
|                                    |  16px gap
+------------------------------------+
| THONG TIN CO BAN                   |  Section header
| +--------------------------------+ |
| | Ten hien thi        Nguyen V > | |  Single-line rows
| |--------------------------------| |
| | Ten nguoi dung      @viet    > | |
| |--------------------------------| |
| | Gioi thieu          Xin ch.. > | |
| +--------------------------------+ |
|                                    |
| TAI KHOAN                          |
| +--------------------------------+ |
| | Email      a@b.com  [verified] | |
| |--------------------------------| |
| | So dien thoai     +84...     > | |
| +--------------------------------+ |
|                                    |
| CA NHAN                            |
| +--------------------------------+ |
| | Ngay sinh          01/01/90  > | |
| |--------------------------------| |
| | Gioi tinh          Nam       > | |
| +--------------------------------+ |
|                                    |  paddingBottom: tabBarInset
+------------------------------------+
```

**Pros:** Maximum content density, no vertical space waste, fastest to scan/edit
**Cons:** Loses visual personality (no cover photo), less engaging

### Option B: Cover + Avatar Overlap (Fixed Current Pattern)

Keeps the current design intent but fixes all structural bugs.

```
+------------------------------------+
| [<] Chinh sua ho so                |  <- Native header (transparent bg)
+====================================+
| ////////////////////////////////// |  <- Cover band: 140px (reduced)
| //      [camera badge]          // |
| ////////////////////////////////// |
+------------------------------------+
|         [====AVATAR====]           |  96px, marginTop: -48
|         [  camera icon  ]          |
|                                    |  12px margin bottom
+------------------------------------+
| THONG TIN CO BAN                   |
| +--------------------------------+ |
| | Ten hien thi        value    > | |
| |--------------------------------| |
| | Ten nguoi dung      @user    > | |
| |--------------------------------| |
| | Gioi thieu          text     > | |
| +--------------------------------+ |
|                                    |
| TAI KHOAN                          |
| +--------------------------------+ |
| | Email      addr    [verified]  | |
| |--------------------------------| |
| | So dien thoai     +84...     > | |
| +--------------------------------+ |
|                                    |
| CA NHAN                            |
| +--------------------------------+ |
| | Ngay sinh          date      > | |
| |--------------------------------| |
| | Gioi tinh          value     > | |
| +--------------------------------+ |
|                                    |  paddingBottom: tabBarInset
+------------------------------------+
```

**Changes from current:**
- Cover height reduced: 160 -> 140px
- Avatar reduced: 112 -> 96px (overlap = -48px)
- Tab bar hidden when on EditProfile screen
- Remove own SafeAreaView (native header handles it)
- Add `useTabBarBottomInset()` for scroll padding (or hide tab bar)
- Native header: transparent background overlaying cover, white back arrow

**Pros:** Preserves branding/personality, cover photo is a paid feature in many apps
**Cons:** Still consumes vertical space for a largely decorative element

### Option C: Hero Card (Recommended)

Telegram-inspired centered layout. Avatar prominent at top, name/username shown as display (not editable inline), sections below in grouped cards.

```
+------------------------------------+
| [<] Chinh sua ho so                |  <- Native header, surface bg
+------------------------------------+
|                                    |  24px top spacing
|         [====AVATAR====]           |  104px centered
|         [  camera icon  ]          |
|                                    |  8px gap
|       "Nguyen Van Viet"            |  heading variant, centered
|       "@vietdev"                   |  caption, muted, centered
|                                    |  4px
|       [ Doi anh bia ]              |  ghost button, small
|                                    |  24px gap
+------------------------------------+
| THONG TIN CO BAN                   |
| +--------------------------------+ |
| | Ten hien thi                   | |  label on top
| | Nguyen Van Viet            [>] | |  body value + chevron
| |--------------------------------| |
| | Gioi thieu                     | |
| | Xin chao moi nguoi...     [>] | |
| +--------------------------------+ |
|                                    |
| TAI KHOAN                          |
| +--------------------------------+ |
| | Email                          | |
| | viet@example.com  [Da xac thu] | |  badge + copy icon
| |--------------------------------| |
| | So dien thoai                  | |
| | +84 912 345 678            [>] | |
| +--------------------------------+ |
|                                    |
| CA NHAN                            |
| +--------------------------------+ |
| | Ngay sinh                      | |
| | 01/01/1990                 [>] | |
| |--------------------------------| |
| | Gioi tinh                      | |
| | Nam                        [>] | |
| +--------------------------------+ |
|                                    |  paddingBottom: tabBarInset
+------------------------------------+
```

**Key design decisions:**
- Avatar is the hero element (104px), no cover band competing for space
- Name + username displayed as "identity preview" below avatar (read from user state, tapping goes to name edit sheet)
- "Doi anh bia" (Change cover photo) as a ghost button removes the need for a full-width cover band
- Cover photo could optionally show as a small thumbnail (48x48 rounded) next to the button
- Sections use the established `KoolaSurface` card pattern
- All form fields have visible labels above values (better for Vietnamese text length)

**Pros:** Clean hierarchy, no wasted space, scales well across device sizes, cover photo is still accessible but not dominant, Telegram-proven pattern
**Cons:** Less visual impact than full cover photo display

---

## C. Recommended Option: C (Hero Card)

### Reasoning

1. **Solves all 5 bugs structurally** -- no cover band to stretch, no complex overlap math, proper scroll padding
2. **Better content density** -- all 7 fields visible without scrolling on most devices (>=640dp height)
3. **Vietnamese text handling** -- with labels above values (instead of beside), longer VN strings have full width to render without truncation
4. **Proven pattern** -- Telegram (2B+ users) uses this exact pattern. Users are familiar with it.
5. **Maintains cover photo functionality** -- via a dedicated button/thumbnail, user can still set/change cover. The cover is displayed on their public profile (ProfileScreen), not on the edit form.
6. **Simpler component tree** -- fewer absolute positioned elements, fewer z-index conflicts

---

## D. Detailed Specification

### Navigation Fix (Critical)

The `shouldHideTabBar` function must be extended OR EditProfileScreen should be registered differently:

**Approach 1 (Minimal):** Extend `shouldHideTabBar` to also hide for PersonalTab when focused child is `EditProfile`:

```
function shouldHideTabBar(route): boolean {
  const name = route.name;
  if (name === 'ChatTab') { ... existing logic ... }
  if (name === 'PersonalTab') {
    const focused = getFocusedRouteNameFromRoute(route) ?? 'PersonalHome';
    if (focused === 'EditProfile' || focused === 'StorageSettings') return true;
  }
  return false;
}
```

**Approach 2 (Preferred):** Create a generic mechanism -- hide tab bar for ANY non-root child in any tab stack. This future-proofs as more screens get added.

### Remove Double SafeAreaView

Since `PersonalTabStack` sets `headerShown: true` for EditProfile, the native stack already provides safe area handling. The screen's own `<SafeAreaView>` should become a plain `<View style={{flex:1}}>`.

### Layout Structure (Option C Implementation)

```
View (flex: 1, bg: canvas)
+-- ScrollView
    +-- contentContainerStyle: { paddingBottom: tabBarInset || 32 }
    |
    +-- View.heroSection (alignItems: center, paddingTop: 24, paddingBottom: 24)
    |   +-- Pressable -> UserAvatar (size: 104)
    |   |   +-- camera badge (absolute, bottom-right)
    |   +-- KoolaText variant="heading" (user.displayName)
    |   +-- KoolaText variant="caption" tone="muted" (@username or "Chua dat")
    |   +-- KoolaButton variant="ghost" size="sm" ("Doi anh bia")
    |
    +-- View.sectionHeader
    |   +-- KoolaText variant="caption" weight="700" tone="muted"
    +-- KoolaSurface.sectionCard (variant="flat", marginHorizontal: 16, radius: md)
    |   +-- SettingRow (label, value, onPress) x N
    |
    +-- (repeat for each section)
```

### Spacing Tokens

| Element | Token | Value | Rationale |
|---------|-------|-------|-----------|
| Hero top padding | `koolaSpacing.xl` | 24px | Breathing room after header |
| Avatar size | -- | 104px | Prominent but not overwhelming |
| Avatar-to-name gap | `koolaSpacing.sm` | 8px | Tight coupling |
| Name-to-username gap | `koolaSpacing.xs` | 4px | Visual pair |
| Username-to-button gap | `koolaSpacing.md` | 12px | Separation before action |
| Hero bottom padding | `koolaSpacing.xl` | 24px | Clear section boundary |
| Section header padding-top | `koolaSpacing.xl` | 24px | Reduced from current 20 for alignment |
| Section header padding-bottom | `koolaSpacing.sm` | 8px | Tight to card |
| Section card margin-horizontal | `koolaSpacing.lg` | 16px | Standard card margin |
| Section card border-radius | `koolaRadii.md` | 14px | Existing pattern |
| Row min-height | -- | 56px | Accommodates 2-line label+value |
| Row padding-horizontal | `koolaSpacing.lg` | 16px | Card internal |
| Row padding-vertical | `koolaSpacing.md` | 12px | Comfortable touch |
| Scroll paddingBottom | `useTabBarBottomInset()` | ~86px | Clears floating dock |

### Color Usage

| Element | Token | Notes |
|---------|-------|-------|
| Screen background | `koolaColors.canvas` (#F7F9FC) | Consistent with app |
| Section cards | `koolaColors.surface` (#FFFFFF) | White cards on grey canvas |
| Card border | `koolaColors.line` (#E4E7EC) | Hairline separator |
| Section label text | `koolaColors.muted` (#667085) | De-emphasized |
| Row label (field name) | `koolaColors.muted` (#667085) | Caption variant |
| Row value (content) | `koolaColors.ink` (#101828) | Body variant |
| Placeholder (empty) | `koolaColors.faint` (#98A2B3) | Indicates action needed |
| Chevron icon | `koolaColors.faint` (#98A2B3) | Subtle affordance |
| Avatar camera badge bg | `koolaColors.primary` (#2563EB) | Action indicator |
| Avatar camera badge border | `koolaColors.surface` (#FFFFFF) | Separation ring |
| Ghost button text | `koolaColors.primary` (#2563EB) | Primary action |
| Email badge | `KoolaBadge tone="success"` | Verified status |

### Typography

| Element | Variant | Weight | Tone |
|---------|---------|--------|------|
| Screen title (header) | -- | -- | Native stack default |
| Display name (hero) | heading | 700 | ink |
| Username (hero) | caption | 500 | muted |
| Section header | caption | 700 | muted |
| Row label | caption | 500 | muted |
| Row value | body | 400 | ink |
| Row placeholder | body | 400 | faint |
| Ghost button label | label | 600 | primary |

### States

**Empty values:**
- Show placeholder text in `faint` tone (e.g., "Chua dat", "Them gioi thieu")
- Chevron still present (indicates tappable)

**Loading (avatar/cover upload):**
- Avatar: overlay with `rgba(16,24,40,0.45)` + ActivityIndicator
- Cover button: show inline spinner, disable button
- Pattern already exists in current code -- reuse

**Error:**
- Alert.alert pattern (existing) is acceptable for this screen
- No inline error states needed (edits happen in bottom sheets)

**Saving (in bottom sheet):**
- Already handled by `EditProfileSheet` component (saving prop + disable pattern)

### Accessibility

| Element | Requirement |
|---------|-------------|
| Avatar pressable | `accessibilityRole="button"` `accessibilityLabel="Doi anh dai dien"` |
| Cover button | `accessibilityRole="button"` `accessibilityLabel="Doi anh bia"` |
| Each SettingRow | `accessibilityRole="button"` `accessibilityLabel="{label}: {value or placeholder}"` |
| Email row | `accessibilityRole="button"` `accessibilityLabel="Sao chep email"` `accessibilityHint="Nhan de sao chep"` |
| Section headers | `accessibilityRole="header"` for screen reader navigation |
| All touch targets | Min 44px height (currently met with minHeight: 44 on rows; increase to 56 recommended) |

### Dark Mode Considerations

The app does not currently implement dark mode (no dark theme tokens detected in `theme.ts`). However, for future-proofing:

- Canvas: would map to `#0F1419` (deep dark)
- Surface: would map to `#1C2026` (elevated dark)
- Line: would map to `#2F3542` (subtle separator)
- All text tokens would invert (ink -> white, muted -> lighter grey)
- Cards should use `KoolaSurface` (not hardcoded bg) for automatic theme switching

---

## E. Implementation Hints

### Component Changes Required

1. **Remove `SafeAreaView`** -- replace with `<View style={{flex:1, backgroundColor: koolaColors.canvas}}>` since native header handles safe area.

2. **Remove cover band Pressable + Image** -- replace with hero section containing avatar + name + button.

3. **Add `useTabBarBottomInset()`** -- for scroll padding. OR extend `shouldHideTabBar()` to hide dock on this screen.

4. **Restructure hero section:**
   ```
   <View style={styles.heroSection}>
     <Pressable onPress={handlePickAvatar} ...>
       <UserAvatar size={104} />
       <View style={styles.avatarCameraIcon}>...</View>
     </Pressable>
     <KoolaText variant="heading">{user.displayName}</KoolaText>
     <KoolaText variant="caption" tone="muted">
       {user.username ? `@${user.username}` : 'Chua dat ten nguoi dung'}
     </KoolaText>
     <KoolaButton variant="ghost" size="sm" onPress={handlePickCover}>
       Doi anh bia
     </KoolaButton>
   </View>
   ```

5. **Keep SettingRow component** -- it works well. Increase `minHeight` to 56px for the two-line layout (label above, value below).

6. **Remove `coverBand`, `coverImage`, `coverFallback`, `coverOverlay`, `coverIconBadge`** styles.

7. **Keep all 6 bottom sheets** unchanged -- they work independently of the main layout.

### Navigation Fix

In `MainNavigator.tsx`, extend `shouldHideTabBar`:

```javascript
const FULLSCREEN_ROUTES: Record<string, Set<string>> = {
  ChatTab: new Set(['Chat', 'MomentViewer', 'MomentComposer']),
  PersonalTab: new Set(['EditProfile', 'StorageSettings']),
};

function shouldHideTabBar(route: RouteProp<MainTabParamList, TabName>): boolean {
  const hiddenSet = FULLSCREEN_ROUTES[route.name];
  if (!hiddenSet) return false;
  const focused = getFocusedRouteNameFromRoute(route) ?? '';
  return hiddenSet.has(focused);
}
```

### File Impact

| File | Change Type |
|------|-------------|
| `EditProfileScreen.tsx` | Major rewrite (layout restructure) |
| `MainNavigator.tsx` | Small fix (extend shouldHideTabBar) |
| No other files affected | -- |

---

## F. Anti-Patterns to AVOID

- Do NOT use `position: absolute` for the avatar placement in the new layout (eliminates overlap math bugs)
- Do NOT add custom header component inside the screen when native stack header is enabled
- Do NOT hardcode bottom padding values -- always derive from `useTabBarBottomInset()` or hide the dock
- Do NOT use `height: '100%'` on cover/banner elements inside ScrollView (undefined behavior in RN)
- Do NOT mix `SafeAreaView` with native stack headerShown (double inset)
- Do NOT use `TouchableOpacity` for the cover button -- use `Pressable` + `KoolaButton`

---

## G. Reference Patterns

| App | Pattern | Relevance |
|-----|---------|-----------|
| Telegram iOS | Centered avatar (no cover), name displayed, list-style fields below | Direct inspiration for Option C |
| WhatsApp | Large centered avatar, name + about below, minimal fields | Similar to Option C but fewer fields |
| Zalo | Cover + avatar overlap (like current Koola) but with proper header integration | Reference for Option B if kept |
| iOS Settings (Apple ID) | Small avatar, name + email shown, grouped table sections | Compact variant |
| Instagram | Large centered avatar + "Edit profile picture" link, form fields below | Hybrid approach |

---

## H. Verification Checklist

Before shipping the redesign:

- [ ] All 7 fields visible without scrolling on 640dp+ devices
- [ ] Tab bar hidden (or proper bottom padding applied)
- [ ] No double safe area inset
- [ ] Avatar camera badge visible and tappable (44px+ target)
- [ ] Cover photo change still accessible via button
- [ ] All bottom sheets still open correctly
- [ ] Vietnamese strings do not truncate in any row
- [ ] Email badge ("Da xac thuc") + copy icon visible
- [ ] Loading states work for avatar upload
- [ ] Screen accessible via VoiceOver/TalkBack
- [ ] Press feedback on all interactive elements
- [ ] Android ripple on pressables
