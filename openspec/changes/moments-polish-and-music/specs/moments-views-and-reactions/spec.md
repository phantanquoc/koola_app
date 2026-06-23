## MODIFIED Requirements

### Requirement: View Count Aggregation via Redis Counter
The system SHALL maintain an approximate `viewCount` on the Story root document via a Redis counter incremented per view and flushed to MongoDB by a once-per-minute cron. The cron SHALL locate pending counters via a Redis dirty-set (`moments:dirty-stories`) rather than a `KEYS`/`SCAN` of `moments:story:*:views`, consistent with the codebase ban on blocking key scans.

#### Scenario: Counter increments on view record
- **WHEN** a new view is recorded by a non-author
- **THEN** Redis `INCR moments:story:<storyId>:views` is called AND the storyId is added to the `moments:dirty-stories` set via `SADD`

#### Scenario: Counter flushed once per minute
- **WHEN** the cron job runs (`CronExpression.EVERY_MINUTE`)
- **THEN** the system reads the dirty-set via `SMEMBERS moments:dirty-stories`, and for each storyId reads its counter, sets `Stories.viewCount += <value>`, and decrements the Redis counter by the flushed amount atomically via `DECRBY`

#### Scenario: Fully-drained story is removed from the dirty-set
- **WHEN** a story's counter reaches zero after the flush `DECRBY` (or was already zero)
- **THEN** the storyId is removed from `moments:dirty-stories` via `SREM` so subsequent ticks do not re-scan it

#### Scenario: Counter survives backend restart
- **WHEN** the backend restarts mid-flush window
- **THEN** Redis retains pending increments and the dirty-set membership; the next cron flush includes them

#### Scenario: Counter flush is idempotent on partial failure
- **WHEN** a flush fails after Mongo update but before Redis decrement
- **THEN** the storyId remains in the dirty-set and the next flush re-applies the same increment, accepted as best-effort approximation; StoryViews collection remains the audit source of truth

### Requirement: Story Reactions
The system SHALL allow each viewer to react with exactly one emoji per story; re-reacting overwrites the previous emoji. The single-reaction-per-viewer invariant SHALL hold under concurrent requests.

#### Scenario: First reaction by a viewer
- **WHEN** viewer calls `POST /moments/stories/:storyId/reactions` with `{ emoji: "😂" }`
- **THEN** system appends `{ userId: viewerId, emoji: "😂", createdAt: now }` to the story's `reactions` array, emits `story.reaction` to the author's user-room with `{ storyId, viewerId, emoji }`, returns HTTP 200

#### Scenario: Re-reaction by same viewer
- **WHEN** viewer reacts again with a different emoji
- **THEN** system updates the existing entry for that `userId` in place via the positional operator (`$set` on `reactions.$.emoji`); the array still contains exactly one entry per `userId`

#### Scenario: Concurrent first reactions do not double-insert
- **WHEN** two requests from the same viewer race on a story with no prior reaction from that viewer
- **THEN** the in-place `$set` matches nothing for both, and the fallback `$push` is guarded by `reactions.userId $ne viewerId` so at most one entry is inserted for that `userId`

#### Scenario: Reaction with unsupported emoji
- **WHEN** the emoji is not in the allowed set `{ ❤️, 😂, 😮, 😢, 😡, 👏, 🔥 }`
- **THEN** system returns HTTP 400 with `"Unsupported reaction emoji"`
