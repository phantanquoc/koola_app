## ADDED Requirements

### Requirement: Music picker state clarity
The Moments music picker SHALL make search, loading, empty, selected-track, previewing, and disabled states clear without changing music API semantics.

#### Scenario: Music search is loading
- **WHEN** the user searches the music library and results are loading
- **THEN** the picker SHALL present a loading state that does not look like an empty result

#### Scenario: Music search has no results
- **WHEN** a music search completes with no tracks
- **THEN** the picker SHALL present an empty state that explains no tracks matched and allows the user to continue editing the Moment

#### Scenario: Track is selected
- **WHEN** the user selects a music track
- **THEN** the picker SHALL clearly identify the selected track and keep the user's selection available for publishing

### Requirement: Music preview lifecycle remains safe
Music picker visual polish SHALL preserve preview start, stop, and close behavior.

#### Scenario: Picker closes during preview
- **WHEN** the music picker is closed while a track preview is playing
- **THEN** the preview audio SHALL stop and SHALL NOT continue in the background

#### Scenario: Selected preview changes
- **WHEN** the user starts previewing a different track
- **THEN** any previous preview SHALL stop before the new preview starts

#### Scenario: Publish uses selected music
- **WHEN** a Moment is published with a selected track
- **THEN** the existing selected music reference SHALL be submitted without changing music library API semantics
