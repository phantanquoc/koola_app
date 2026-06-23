## MODIFIED Requirements

### Requirement: @mention Parsing and Privacy-Aware Notification
The system SHALL parse @mentions from the caption into a structured array and send notifications gated by the mentioner's privacy setting. The connection check for private mentioners SHALL use the DIRECT-conversation connection graph (`ConversationsService.getConnectedUserIds`), consistent with the `connections` audience scope. An eligible mention SHALL produce both a `story.mention` socket event and a real FCM push (`NotificationsService.sendMentionPush`) with deep-link `koola://moments/story/<storyId>`, subject to the recipient's standard push-eligibility gates (notifications enabled, offline, has FCM tokens, dedup).

#### Scenario: Caption with valid mentions parsed
- **WHEN** caption contains `@username` tokens that match existing users
- **THEN** the story's `mentions` array is populated with `{ userId, username, offset, length }` for each match

#### Scenario: Mention notification when mentioner is public
- **WHEN** mentioner has `isPrivate = false` and a user is mentioned
- **THEN** system emits `story.mention` to the mentioned user's user-room AND calls `NotificationsService.sendMentionPush` with the mentioned userId, the author's display name, the storyId, and a caption snippet; the push carries `data.deepLink = koola://moments/story/<storyId>`

#### Scenario: Mention notification when mentioner is private and connected
- **WHEN** mentioner has `isPrivate = true` and the mentioned user is in the mentioner's `getConnectedUserIds` set
- **THEN** the socket event and FCM push are sent

#### Scenario: Mention notification suppressed for private mentioner / non-connection
- **WHEN** mentioner is private AND the mentioned user is NOT in the mentioner's connection set
- **THEN** neither the socket event nor the FCM push is sent (silently suppressed); the mention is still recorded in the story document

#### Scenario: Self-mention never notifies
- **WHEN** the author mentions themselves in the caption
- **THEN** no socket event and no FCM push are produced for the author

#### Scenario: Mention of non-existent username
- **WHEN** caption contains `@notarealuser` with no matching User
- **THEN** the token is left as plain text and not added to `mentions`
