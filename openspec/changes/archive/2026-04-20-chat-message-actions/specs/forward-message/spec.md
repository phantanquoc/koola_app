## ADDED Requirements

### Requirement: Forward message to conversations
The system SHALL allow users to forward a message (text, image, or file) to one or more conversations (max 10). The forwarded message SHALL be prefixed with "[Chuyển tiếp]" and contain the same content/media as the original.

#### Scenario: Forward text message to one conversation
- **WHEN** user selects "Chuyển tiếp", picks 1 conversation, and confirms
- **THEN** a new message is created in the target conversation with content "[Chuyển tiếp] {original content}", the forward modal closes, and a Toast shows "Đã chuyển tiếp"

#### Scenario: Forward image message to multiple conversations
- **WHEN** user selects "Chuyển tiếp", picks 3 conversations, and confirms
- **THEN** 3 new image messages are created (one per target), each with "[Chuyển tiếp]" prefix in content and the same mediaUrl/mediaMimeType/mediaSize

#### Scenario: Forward limit exceeded
- **WHEN** user tries to select more than 10 conversations
- **THEN** the 11th selection is prevented and a Toast shows "Tối đa 10 cuộc hội thoại"

### Requirement: Forward modal shows conversation list
The system SHALL display a modal with the user's conversation list, each with a checkbox for multi-select, a search bar to filter, and a "Gửi" (Send) button.

#### Scenario: Search conversations in forward modal
- **WHEN** user types in the search bar
- **THEN** the conversation list filters by name match

#### Scenario: Empty selection
- **WHEN** user taps "Gửi" without selecting any conversation
- **THEN** the button is disabled (grayed out)
