## ADDED Requirements

### Requirement: ICE restart on connection failure
When the ICE connection state becomes 'failed' and the call is in 'active' state, webrtcService SHALL attempt an ICE restart by calling createOffer({ iceRestart: true }) and re-signaling via the server. The system SHALL limit ICE restart attempts to a maximum of 2 per session.

#### Scenario: First ICE failure during active call
- **WHEN** peerConnection.iceConnectionState changes to 'failed' and the call state is 'active' and the retry count is 0
- **THEN** webrtcService increments the retry counter and initiates an ICE restart offer

#### Scenario: Second ICE failure after restart
- **WHEN** peerConnection.iceConnectionState changes to 'failed' after one ICE restart and the retry count is 1
- **THEN** webrtcService performs a second ICE restart

#### Scenario: ICE restart succeeds
- **WHEN** ICE connection recovers after a restart
- **THEN** the call state returns to 'active' and the retry counter is not reset (retries are per-session, not per-failure)

#### Scenario: Max retries exceeded
- **WHEN** peerConnection.iceConnectionState changes to 'failed' and the retry count is already at 2
- **THEN** webrtcService transitions the call state to 'failed', emits 'call_failed' to the server, and stops attempting restarts

#### Scenario: ICE failure while not in active state
- **WHEN** peerConnection.iceConnectionState changes to 'failed' but call state is not 'active'
- **THEN** no ICE restart is attempted

### Requirement: Adaptive video quality
During an active video call, webrtcService SHALL poll peerConnection.getStats() every 5 seconds. If packet loss exceeds 5% over two consecutive polls, the video track constraints SHALL be reduced to 320x240. When two consecutive polls show packet loss at or below 5%, the constraints SHALL be restored to 640x480.

#### Scenario: Sustained high packet loss detected
- **WHEN** two consecutive 5-second polls show packet loss above 5%
- **THEN** webrtcService applies 320x240 video constraints to the local video track

#### Scenario: Network conditions recover
- **WHEN** two consecutive 5-second polls show packet loss at or below 5% after degradation
- **THEN** webrtcService restores 640x480 video constraints to the local video track

#### Scenario: Stats polling only active during video call
- **WHEN** call type is 'audio' or call state is not 'active'
- **THEN** the stats polling interval is not started or is cleared

#### Scenario: Stats polling cleared on call end
- **WHEN** the call transitions to any terminal state (ended, failed)
- **THEN** the getStats polling interval is cleared

### Requirement: switchCamera capability
webrtcService SHALL expose a switchCamera() method that calls the react-native-webrtc API to flip between front and rear cameras on the local video track. This method SHALL only have effect when a local video track is active.

#### Scenario: switchCamera called during active video call
- **WHEN** switchCamera() is called and a local video track exists
- **THEN** the camera flips (front↔rear) and the remote peer receives the updated stream

#### Scenario: switchCamera called without active video track
- **WHEN** switchCamera() is called but no local video track exists
- **THEN** the method returns without error and no camera change occurs

### Requirement: cancelCall capability
webrtcService SHALL expose a cancelCall(sessionId) method. When called, it SHALL emit 'call_cancel' to the server with the sessionId, clean up the peer connection, stop local media tracks, and transition state to 'ended'.

#### Scenario: Caller cancels before answer
- **WHEN** cancelCall(sessionId) is called while call state is 'initiating' or 'ringing'
- **THEN** 'call_cancel' is emitted, local tracks stop, peer connection closes, state transitions to 'ended'

#### Scenario: cancelCall called in invalid state
- **WHEN** cancelCall(sessionId) is called while call state is 'active'
- **THEN** the call is not cancelled (hangup should be used instead); a warning is logged
