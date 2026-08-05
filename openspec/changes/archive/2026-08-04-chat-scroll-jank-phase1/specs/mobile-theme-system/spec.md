## ADDED Requirements

### Requirement: Chat day separators and system messages follow the active theme

Every chat surface rendered through a memoized render callback — specifically the day separator between message groups and the inline system message — SHALL resolve its colors from the active theme and SHALL recolor when the theme mode changes, without requiring the screen to be remounted or the app restarted.

A render callback that references themed styles SHALL declare those styles among its dependencies, so that a theme change produces a new callback rather than one that has captured the previous palette.

Rationale: both callbacks referenced themed styles while declaring an empty dependency list, permanently capturing the palette that was active on first render. After switching light↔dark, day separators and system messages kept their stale colors while the rest of the chat screen recolored correctly.

#### Scenario: Day separator recolors on mode switch

- **WHEN** the chat screen is open showing at least one day separator and the theme mode changes from light to dark
- **THEN** the day separator's background, border, and text colors update to the dark palette without remounting the screen

#### Scenario: System message recolors on mode switch

- **WHEN** the chat screen is open showing an inline system message and the theme mode changes
- **THEN** the system message text color updates to the active palette

#### Scenario: Theme switch while scrolled into history

- **WHEN** the user has scrolled up into older messages and the theme mode changes
- **THEN** all visible day separators and system messages render with the new palette, matching newly rendered ones
