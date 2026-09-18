## Context

Tab Tron chuyen dang dung thanh tim kiem tinh dat tren FlatList/SectionList cac hoi thoai. Thanh nay khong co hieu ung glass, khong phan hoi cuon va khong chia se ngon ngu dock noi. Du an da co `BlurView`, `react-native-reanimated` (`SharedValue`, `useAnimatedStyle`, `interpolate`), va `AccessibilityInfo` de ho tro reduce-motion. Change nay dua search bar ve dang dock co dinh dinh man hinh, trong suot co blur, morph theo cuon va cho list cuon sau lung.

## Goals / Non-Goals

**Goals:**

- Glass dock tim kiem co dinh voi blurAmount 18, overlayColor dark/light, innerEdge, hairline, shadow md. Layer: Animated.View shadowWrap (overflow visible) -> View host (border + overflow hidden) -> BlurView full-fill -> innerEdge -> content.
- Morph chieu cao 48->36 theo `dockProgress` (0 = mo rong, 1 = thu gon) qua `useAnimatedStyle` + `interpolate` tren worklet. `dockProgress` la binary toggle via direction thresholds (travel > 8 -> 1, travel < -8 / offset <= 4 -> 0, withTiming 260/220/180).
- Giu du 3 nut hanh dong khi thu gon, chi co gap/icon scale (paddingHorizontal giu 4).
- Depth: list cuon sau lung dock thong qua `contentContainerStyle.paddingTop`.
- Reduce-motion: nhanh tach tat morph khi nguoi dung bat giam chuyen dong; doc prefersReducedMotion() NGOAI worklet va truyen boolean/SharedValue vao worklet.

**Non-Goals:**

- Thay doi sub-tab, unread badge, thuat toan search/filter, dieu huong.
- Them dependency moi ngoai blur/reanimated da co.
- Doi API, backend, hay data model.

## Decisions

### D1 - Glass blur (quyet dinh khoa 1:C)

`ChatSearchDock` dung `BlurView` full-fill voi `blurAmount = 18` va `overlayColor` `rgba(255,255,255,0.62)` (light) / `rgba(28,32,38,0.52)` (dark). Khong dung overlay View rieng biet (tranh duplicate alpha). Tren blur la `innerEdge` (top highlight hairline `rgba(255,255,255,0.55)` light / `rgba(255,255,255,0.08)` dark) va hairline border `StyleSheet.hairlineWidth` voi mau `rgba(0,0,0,0.08)` light / `rgba(255,255,255,0.10)` dark nam tren `host`. Shadow md ap dung tren container ngoai `shadowWrap`: offset {0,8}, radius 24, opacity 0.12 light / 0.35 dark, elevation 6. Thu tu layer: Animated.View shadowWrap (shadow, overflow visible) -> View host (border, overflow hidden, pill) -> BlurView full-fill -> innerEdge -> content. Lua chon loai tru overlay View duplicate: BlurView overlayColor da du; them View overlay rieng lam double alpha va kho dong bo mau. Lua chon loai tru overflow hidden tren shadowWrap: se clip shadow.

### D2 - Morph 48->36 via SharedValue + interpolate (quyet dinh khoa 2:B) — BINARY TOGGLE

`dockProgress: SharedValue<number>` chi nhan 0 hoac 1 (binary toggle), cap nhat tu `onScroll` cua list qua `useAnimatedScrollHandler` voi direction threshold: tich luy `directionTravel` theo delta; khi dang keo xuong va `travel > 8` thi toggle -> 1 (`withTiming` 260ms); khi keo len va `travel < -8` thi toggle -> 0 (`withTiming` 220ms); khi `offsetY <= 4` thi reset ve 0 (`withTiming` 180ms). Khong map tuyen tinh scrollY 0..80 -> 0..1. Trong `ChatSearchDock`, `useAnimatedStyle` tra ve `{ height: interpolate(progress.value, [0,1], [48,36]), paddingHorizontal: interpolate(..., [4,4]), gap: interpolate(..., [8,6]) }` tren UI thread. paddingHorizontal giu 4 ca hai trang thai (khong tang khi collapse). Lua chon loai tru linear 0..80 interpolation: RCM quyet dinh dung toggle 8px threshold de tranh morph lien tuc gay jank va de dong bo voi hiddenProgress.

### D3 - Giu 3 nut khi thu gon (quyet dinh khoa 3:B)

Ca 3 nut van render o ca hai trang thai. Khi `progress -> 1`, chi giam `gap` 8->6, icon scale 1->0.82 (22->~18) va fontSize 13->11.5 qua interpolate; `paddingHorizontal` giu 4; khong `display: none`, khong giam so nut. Dam bao tap target van >= 36dp (nut thu gon van 36 cao, du hitSlop neu can). Lua chon loai tru an nut: vi pham yeu cau san pham giu du chuc nang khi thu gon.

### D4 - List depth via contentContainerStyle paddingTop (quyet dinh khoa 4:B)

FlatList/SectionList cua tab Tron chuyen giu `contentContainerStyle: { paddingTop: DOCK_EXPANDED_HEIGHT + topInset }` voi `DOCK_EXPANDED_HEIGHT = 48` cong them khoang cach an toan 8px. Dock render tuyet doi dinh top voi `zIndex` cao hon list. Khi cuon, noi dung list truot sau lung dock trong suot (nho glass) thay vi bi day xuong. Khong dung marginTop ngoai hay stickyHeaderIndices cho dock. Lua chon loai tru margin: margin lam mat hieu ung depth.

### D5 - Reduce-motion branch (worklet-safe)

Luc mount, doc `AccessibilityInfo.isReduceMotionEnabled()` va lang nghe `reduceMotionChanged` (hoac via `prefersReducedMotion()` polling + listener). Trong `ChatSearchDock`, doc `prefersReducedMotion()` NGOAI worklet (trong render) va capture `reduceMotion` boolean de `useAnimatedStyle` branch tren bien do (khong goi ham trong worklet). Trong `ConversationListScreen.handleScroll` (worklet), doc `reduceMotionSV: SharedValue<number>` (dong bo tu JS listener) va early return: set `hiddenProgress/dockProgress = 0` truc tiep (khong `withTiming`) va khong chay logic direction threshold. Khong ap dung `withTiming`/`withSpring` nao cho morph trong nhanh nay. Lua chon loai tru chi giam duration: yeu cau la tat hoan toan morph; goi ham trong worklet vi pham worklet-safe.

### D6 - To chuc component

`ChatSearchDock` nhan props `{ dockProgress: SharedValue<number> }` va render input + 3 nut. Logic scroll va reduceMotion nam o man hinh cha (`ChatHomeScreen` + `ConversationListScreen`) de giu dock thuan presentational. Token overlay/hairline/shadow neu thieu thi them vao `theme.ts` dang additive-only.

## Risks / Trade-offs

- [BlurView khong ho tro tren mot so Android cu] -> overlayColor ban trong suot dam bao van doc duoc; khong crash.
- [Jank khi interpolate tren JS thread] -> dung worklet + useAnimatedStyle de chay tren UI thread; tranh setState theo scroll.
- [Hairline bien mat tren density thap] -> dung `StyleSheet.hairlineWidth` thay vi 0.5 cung.
- [Doi chieu cao lam nhay layout input] -> interpolate dong bo height/gap de chuyen doi muot; giam font/icon ti le nho.
- [Shadow bi clip] -> shadowWrap overflow visible, clip chi o host.

## Migration Plan

Single batch, khong migration du lieu. Rollback = revert commit batch; token glass la additive nen revert khong de lai tham chieu treo ngoai file batch.

## Open Questions

Khong co.
