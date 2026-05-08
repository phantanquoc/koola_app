## ADDED Requirements

### Requirement: Connect tab uses swipeable sub-tabs replacing the filter chip scroll row
`ConnectHomeScreen` SHALL render a `createMaterialTopTabNavigator` with 3 sub-tabs instead of the horizontal `ScrollView` of `FilterChip` components. The tab navigator SHALL have `swipeEnabled: true` and `lazy: true`.

Tab definitions:
- Tab 1: "Tất cả" — fetches businesses with no `relationshipType` filter
- Tab 2: "Đối tác" — fetches businesses with `relationshipType: 'partner'`
- Tab 3: "Nhà cung cấp" — fetches businesses with `relationshipType: 'supplier'`

#### Scenario: Default tab on mount
- **WHEN** the user navigates to the Connect tab
- **THEN** the "Tất cả" tab is active and its business list loads

#### Scenario: Swipe between tabs
- **WHEN** the user swipes left on the Connect tab
- **THEN** the next sub-tab becomes active and its business list loads (lazy)

#### Scenario: Tab press switches tab
- **WHEN** the user taps the "Đối tác" tab label
- **THEN** the Partners tab becomes active and fetches businesses with `relationshipType: 'partner'`

### Requirement: Custom text-label tab bar
The sub-tab bar SHALL use a custom tab bar component displaying text labels (not icons). The active tab label SHALL be styled with color `#1565C0` and an underline indicator. Inactive labels SHALL use color `#6B7280`.

#### Scenario: Active tab visual
- **WHEN** a tab is active
- **THEN** its label is blue (`#1565C0`) and a blue underline indicator is visible beneath it

#### Scenario: Inactive tab visual
- **WHEN** a tab is not active
- **THEN** its label is grey (`#6B7280`) with no underline indicator

### Requirement: Suppliers tab includes category sub-filter
The "Nhà cung cấp" tab SHALL render a horizontal `ScrollView` of `FilterChip` components (from `BUSINESS_CATEGORIES`) as a `ListHeaderComponent` of its FlatList, allowing category filtering within the supplier relationship type.

#### Scenario: Category chip filters the supplier list
- **WHEN** the user taps a category chip in the Suppliers tab
- **THEN** the business list refreshes showing only suppliers in that category

#### Scenario: "Tất cả" category chip resets filter
- **WHEN** the user taps the "Tất cả" category chip
- **THEN** the category filter is reset and all suppliers are shown

### Requirement: All Vietnamese text in the Connect tab navigation area uses correct diacritics
The following strings SHALL be corrected throughout the Connect feature:

- `constants.ts` RELATIONSHIP_FILTERS: "Tất cả", "Đối tác", "Nhà cung cấp"
- `constants.ts` BUSINESS_CATEGORIES: "Tất cả", "Nội địa", "Nguyên liệu", "Bao bì", "Sản xuất", "Thực phẩm", "Công nghệ", "Tài chính", "Bán lẻ", "Y tế", "Giáo dục"
- `BusinessCard.tsx`: type labels "Đối tác", "Nhà cung cấp"
- `BusinessProfileScreen.tsx`: "Giới thiệu", "Liên hệ", "Địa chỉ", "Đối tác", "Nhà cung cấp", "Đã kết nối", "Kết nối ngay", "Không tìm thấy doanh nghiệp", "người đã kết nối"
- `EmptyConnect.tsx`: "Chưa có doanh nghiệp nào", "Hãy thử thay đổi bộ lọc để tìm kết quả phù hợp"
- `ConnectTabStack.tsx` header: "Hồ sơ doanh nghiệp"
- `KoolaHeader.tsx` searchPlaceholder in ConnectHomeScreen: "Tìm doanh nghiệp..."

#### Scenario: Filter chip labels display correctly
- **WHEN** the Nhà cung cấp tab is rendered
- **THEN** category chips display "Tất cả", "Nội địa", "Bao bì", etc. with full Vietnamese diacritics

#### Scenario: BusinessCard type badge displays correctly
- **WHEN** a business of type `partner` is rendered in a BusinessCard
- **THEN** the type label reads "Đối tác" (not "Doi tac (Partners)")
