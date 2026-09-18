## 1. Glass dock shell

- [x] 1.1 Tao `ChatApp/src/screens/main/components/chat/ChatSearchDock.tsx` voi cau truc container (shadow md) -> BlurView blurAmount 18 full-fill -> overlay dark/light -> innerEdge (top highlight) -> hairline border -> content row (input + 3 nut) — implemented inline as `ChatSearchDock` in `ChatHomeScreen.tsx` mirroring `MainNavigator.TabDockBackground`
- [x] 1.2 Dinh nghia token glass trong `ChatApp/src/ui/theme.ts` neu thieu (overlay, innerEdge, hairline, shadow md) dang additive-only; khong doi token hien co — reused existing `koolaShadows.md/koolaDarkShadows.md` and inline overlay/innerEdge/hairline tokens (no new theme token needed)

## 2. Morph theo cuon

- [x] 2.1 O man hinh tab Tron chuyen, tao `dockProgress: SharedValue<number>` va cap nhat tu `onScroll` qua `useAnimatedScrollHandler` (map scrollY 0..80 -> progress 0..1, clamp) — `dockProgress` in `ChatHomeScreen`, driven from `ConversationListScreen.handleScroll` with same thresholds as `hiddenProgress`
- [x] 2.2 Trong `ChatSearchDock`, dung `useAnimatedStyle` + `interpolate` tren worklet de morph `height` 48->36, `paddingHorizontal` 16->10, `gap` 10->6, `iconSize` 18->16, `fontSize` 14->12.5 theo `dockProgress`

## 3. Giu 3 nut khi thu gon

- [x] 3.1 Dam bao ca 3 nut van render o ca hai trang thai, chi co kich thuoc/padding/gap; nut thu gon van cao 36 va hitSlop du 44dp
- [ ] 3.2 Kiem thu tap duoc ca 3 nut o trang thai thu gon tren thiet bi that

## 4. List depth

- [x] 4.1 Dat `contentContainerStyle.paddingTop = DOCK_EXPANDED_HEIGHT (48) + topInset + 8` cho FlatList/SectionList tab Tron chuyen; dock tuyet doi dinh top voi zIndex cao hon list — `flatH + dockReserve` (header + 56) via `getNotchHeaderHeight`
- [ ] 4.2 Kiem thu cuon: noi dung list truot sau lung dock glass, khong bi day hay che mat dong dau khi o scroll 0

## 5. Reduce-motion

- [x] 5.1 Doc `AccessibilityInfo.isReduceMotionEnabled()` luc mount va lang nghe thay doi; khi `reduceMotion === true` ep `dockProgress.value = 0` va tra style tinh (khong interpolate) trong `useAnimatedStyle` — via `prefersReducedMotion()` from `ui/tokens/motion.ts` (hydrated from `AccessibilityInfo`)
- [ ] 5.2 Kiem thu bat/tat reduce-motion tren thiet bi: bat -> dock co dinh 48 khong morph; tat -> morph hoat dong lai

## 6. Verification gates

- [ ] 6.1 Chay `openspec list --json` thay `chat-search-dock-redesign` trong danh sach
- [ ] 6.2 Chay `openspec validate --strict` khong loi
- [ ] 6.3 Kiem tra thu cong tren thiet bi: glass hien ro tren ca light/dark, morph muot, 3 nut du, depth dung, reduce-motion dung
