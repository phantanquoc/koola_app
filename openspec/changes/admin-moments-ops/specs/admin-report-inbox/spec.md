# Spec Delta

## ADDED Requirements

### Requirement: Post reports resolve to readable content

Reports whose `targetType` is `post` SHALL resolve the same context that message and story reports already resolve: a display name, an author line, and a signed preview of the reported media.

#### Scenario: Caption is the target name

- **WHEN** an admin lists or opens a report targeting a post with a non-empty caption
- **THEN** `targetName` SHALL be the caption truncated to 80 characters

#### Scenario: Media-only post gets a label, not an empty cell

- **WHEN** the reported post has no caption
- **THEN** `targetName` SHALL be `[Bài đăng]`, so the report never renders an empty quote

#### Scenario: Author is named

- **WHEN** the post's author can be resolved
- **THEN** `targetDetail` SHALL read `Bài đăng của <tên tác giả>`

#### Scenario: Only the first media item is rendered, all are signed

- **WHEN** the reported post carries several media items
- **THEN** the report SHALL expose the first item's signed URL, thumbnail URL, and media type, and SHALL sign every key of the post in the same batch so the cache is warm

#### Scenario: Deleted post does not break the list

- **WHEN** the report points at a post that no longer exists
- **THEN** the report SHALL still be returned with the other fields intact and no resolved target context, rather than failing the page
