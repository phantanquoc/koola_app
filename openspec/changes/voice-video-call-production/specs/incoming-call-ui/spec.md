## ADDED Requirements

### Requirement: Full-screen incoming call modal
The system SHALL display a full-screen modal when an incoming call is received, replacing the current Alert.alert behavior. The modal SHALL show the caller's display name, avatar, and call type (audio or video). The modal SHALL present two buttons: Accept (green) and Decline (red).

#### Scenario: Incoming call received while app is foregrounded
- **WHEN** the 'incoming_call' socket event is received
- **THEN** the app navigates to IncomingCallScreen as a fullScreenModal, showing caller name, avatar, and call type

#### Scenario: User accepts the call
- **WHEN** the user taps the Accept button
- **THEN** the incoming call screen dismisses and the app navigates to CallScreen with the session parameters

#### Scenario: User declines the call
- **WHEN** the user taps the Decline button
- **THEN** the webrtcService emits 'call_decline', the incoming call screen dismisses, and audio stops

### Requirement: Auto-dismiss incoming call screen on remote events
The IncomingCallScreen SHALL listen for 'call_cancelled' and 'call_timeout' events and SHALL automatically dismiss itself and stop audio when either event is received.

#### Scenario: Caller cancels before callee acts
- **WHEN** the 'call_cancelled' event is received while IncomingCallScreen is displayed
- **THEN** the screen dismisses, ringtone and vibration stop, and no action is emitted by the callee

#### Scenario: Server timeout fires before callee acts
- **WHEN** the 'call_timeout' event is received while IncomingCallScreen is displayed
- **THEN** the screen dismisses, ringtone and vibration stop

### Requirement: Ringing acknowledgement emission
When IncomingCallScreen mounts and displays the incoming call, it SHALL emit 'call_ringing' to the server to notify the caller that the callee's device is alerting.

#### Scenario: Incoming call UI is shown
- **WHEN** IncomingCallScreen mounts with a valid sessionId
- **THEN** 'call_ringing' is emitted to the server with the sessionId

### Requirement: Enhanced CallScreen with remote user info and controls
CallScreen SHALL display the remote user's display name and avatar. It SHALL include: mute toggle, camera toggle (video calls), switch camera button (video calls), speaker toggle, and end call button. It SHALL display connection state ('connecting', 'active', 'failed') to the user. A 'failed' state SHALL show a retry affordance.

#### Scenario: Call enters connecting state
- **WHEN** the call state is 'connecting'
- **THEN** CallScreen displays a 'Connecting...' status label

#### Scenario: Call enters failed state
- **WHEN** the call state is 'failed'
- **THEN** CallScreen displays a failure message and a retry button

#### Scenario: User toggles speaker
- **WHEN** the user taps the speaker button
- **THEN** callAudioService toggles the speakerphone and the button reflects the new state

#### Scenario: User switches camera
- **WHEN** the user taps the switch camera button during a video call
- **THEN** webrtcService.switchCamera() is called and the local video stream updates

### Requirement: Navigation parameters for call screens
IncomingCallScreen SHALL receive via navigation params: sessionId, callType, and remoteUser (id, displayName, avatar). CallScreen SHALL receive: sessionId, callType, and remoteUser (id, displayName, avatar).

#### Scenario: Navigation to IncomingCallScreen
- **WHEN** useIncomingCall navigates to IncomingCallModal
- **THEN** all required params (sessionId, callType, remoteUser) are passed

#### Scenario: Navigation to CallModal
- **WHEN** the call is accepted or initiated
- **THEN** all required params (sessionId, callType, remoteUser) are passed to CallModal
