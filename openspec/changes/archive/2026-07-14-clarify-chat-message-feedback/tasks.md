## 1. Baseline and Impact

- [x] 1.1 Capture light/dark screenshots for inbound, outbound, pending, sent, read, failed, text, and media messages
- [x] 1.2 Run GitNexus upstream impact analysis for bubble renderers, message mapping, and delivery-state components before editing
- [x] 1.3 Identify every visible delivery-indicator owner, including GiftedChat defaults and Koola custom renderers

## 2. Bubble Legibility

- [x] 2.1 Add or adjust semantic chat tokens so incoming bubbles remain distinct from the canvas in both themes
- [x] 2.2 Verify text, timestamp, link, reaction, and media metadata contrast against each bubble type
- [x] 2.3 Add component/snapshot coverage for consecutive speakers and long wrapped content

## 3. Single Delivery Indicator

- [x] 3.1 Select the existing Koola delivery renderer as the sole visual owner
- [x] 3.2 Suppress duplicate GiftedChat indicators without changing message state or transport fields
- [x] 3.3 Implement a distinct read indicator visual that differentiates read from sent state (consume incoming read events from `useReadReceipts` in the delivery renderer — defect: `ChatScreen.tsx:573-577` renders identical icon for sent and read)
- [x] 3.4 Keep pending, sent, read, failed, retry, and inbound-message behavior aligned with existing `chat-read-receipts` and `message-outbox` contracts
- [x] 3.5 Override GiftedChat's built-in `renderTime` and tick renderers so media-message metadata renders on a legible surface (defect: `ChatScreen.tsx:528-529` transparent bg + no `renderTime` override makes time text float over image)
- [x] 3.6 Add focused tests that fail if more than one indicator is rendered
- [x] 3.7 Add focused tests that fail if sent and read indicators are visually indistinguishable

## 4. Verification

- [x] 4.1 Run focused chat presentation, read-receipt, and outbox tests
- [x] 4.2 Run `cd ChatApp && npm run tsc`
- [x] 4.3 Run `cd ChatApp && npm run lint`
- [x] 4.4 Perform Android light/dark smoke tests without changing network state semantics
- [x] 4.5 Run `openspec validate clarify-chat-message-feedback --type change --strict --no-interactive`
- [x] 4.6 Run GitNexus change detection before any requested commit and confirm no send/sync/socket flow changed unexpectedly
