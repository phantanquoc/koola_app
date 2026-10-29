## ADDED Requirements

### Requirement: No unwrapped text in Moments render paths
Moments screens SHALL NOT render raw strings outside a `<Text>` component in any state (loading, loaded, error, empty, sheet, viewer), so no "Text strings must be rendered within a `<Text>`" dev warning fires.

#### Scenario: Post-link viewer opens without warning
- **WHEN** the app opens `MomentViewer` from a `koola://moments/post/:id` link while the post fetch is in flight
- **THEN** no dev warning is logged and the loading state renders valid text nodes only

#### Scenario: Comment sheet states render without warning
- **WHEN** the comment bottom sheet cycles through loading, loaded, empty, and error states
- **THEN** no dev warning is logged in any state
