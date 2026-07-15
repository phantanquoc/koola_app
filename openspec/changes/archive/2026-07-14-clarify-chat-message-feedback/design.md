## Context

The active chat canvas and incoming bubble use closely related semantic surfaces in dark mode. GiftedChat also receives built-in sent/read fields while the app renders its own delivery row, allowing two indicators for one message.

## Goals

- Make speaker grouping and state interpretation immediate in both themes.
- Establish one presentation owner for delivery state.
- Keep message transport, persistence, retry, and receipt data untouched.

## Non-Goals

- Replacing GiftedChat.
- Redesigning message synchronization, read-receipt calculation, or dead-letter retry.
- Adding per-member group receipt details.
- Implementing emoji, voice, or other unavailable composer features.

## Decisions

### Distinct bubble layers

Incoming bubbles SHALL use a semantic bubble token that is visibly distinct from the chat canvas. Bubble text SHALL meet normal-text contrast requirements, and the bubble edge SHALL retain at least 3:1 non-text contrast where color alone defines its boundary.

### One delivery renderer

The Koola delivery-state renderer SHALL be the only visible owner of pending, sent, read, and failed indicators. GiftedChat compatibility fields may remain for internal behavior only if their built-in indicator is disabled.

### Metadata belongs to its message

Timestamp and delivery state SHALL form one stable metadata row inside or immediately adjacent to the owning outbound bubble. State changes SHALL not resize the bubble enough to cause a distracting list jump.

## Verification Strategy

- Unit tests map pending/sent/read/failed inputs to exactly one visual state.
- Component tests assert inbound messages render no outbound state.
- Screenshot matrix covers both themes, long text, media, consecutive messages, group chat, and failed retry state.
- Existing outbox and read-receipt tests must continue to pass unchanged.
