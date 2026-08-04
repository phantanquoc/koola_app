## ADDED Requirements

### Requirement: Resolved images reveal without replaying the fade

An image whose local file is already resolved in the in-memory media cache at the moment the row mounts SHALL be revealed immediately, at full opacity, with no fade transition and without waiting for a fresh native load callback. Only an image that must be downloaded (or whose local URI is not yet in the memory cache) SHALL fade in on first reveal.

The fade for newly downloaded images SHALL use the shared motion tokens — duration `koolaDurations.normal` (180ms) and easing `koolaEasing.decelerate` — keeping it within the design-system budget for micro-interactions. When the user has enabled the system reduce-motion setting, as reported by `prefersReducedMotion()`, the fade SHALL be skipped and the image revealed immediately.

Rationale: message rows are recycled continuously while scrolling. Replaying a fade for content that is already on disk both wastes a native render round-trip per recycled row and reads to the user as the image "re-loading".

#### Scenario: Cached image appears immediately on row recycle

- **WHEN** a message row containing an image mounts and that image's local URI is already present in the in-memory media cache
- **THEN** the image renders at full opacity on its first committed frame, with no fade and no intermediate transparent state

#### Scenario: Newly downloaded image fades in once

- **WHEN** a message row containing an image mounts and that image is not yet in the in-memory media cache, and the download subsequently completes
- **THEN** the image fades from transparent to full opacity exactly once, over 180ms, using the decelerate easing curve

#### Scenario: Scrolling back to an already-faded image does not fade again

- **WHEN** an image has already been revealed, the row is recycled out of the viewport, and the user scrolls back so the same row mounts again
- **THEN** the image appears immediately at full opacity, because its URI is now resolved in the memory cache

#### Scenario: Reduce-motion skips the fade entirely

- **WHEN** the system reduce-motion preference is enabled and any image is revealed, whether cache-resolved or freshly downloaded
- **THEN** the image is shown at full opacity with no opacity transition

### Requirement: Image resolution effect does not retrigger itself

The effect that resolves an image's media key SHALL NOT be re-entered as a consequence of its own writes. Cached image dimensions recorded by the effect SHALL NOT participate in the effect's re-run condition, so resolving one image runs the resolution path once rather than twice.

Rationale: dimension data was both written by the effect and referenced in its re-run condition, so every image resolution caused a redundant teardown and re-run during scroll.

#### Scenario: Resolving an image runs the resolution path once

- **WHEN** an image message row mounts with a media key that requires resolution, and the resolution completes and records the image's dimensions
- **THEN** the resolution path executes once for that media key, and recording the dimensions does not cause it to execute again

#### Scenario: Cached dimensions are still applied

- **WHEN** an image's dimensions were recorded during an earlier mount and the same image is rendered again
- **THEN** the row is laid out using those recorded dimensions, with no layout shift when the image appears
