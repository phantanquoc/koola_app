## ADDED Requirements

### Requirement: Ringback tone for caller
The system SHALL play a ringback tone on the caller's device when the call state transitions to 'ringing'. The tone SHALL stop immediately when the call state transitions to any state other than 'ringing'.

#### Scenario: State transitions to ringing
- **WHEN** the webrtcService call state changes to 'ringing'
- **THEN** callAudioService.startRingback() is called

#### Scenario: State transitions away from ringing (accepted)
- **WHEN** the webrtcService call state changes from 'ringing' to 'connecting'
- **THEN** callAudioService.stop() is called

#### Scenario: State transitions away from ringing (cancelled/busy)
- **WHEN** the call ends from ringing state due to cancel, busy, or timeout
- **THEN** callAudioService.stop() is called

### Requirement: Ringtone and vibration for callee
The system SHALL play a ringtone and vibrate the device when IncomingCallScreen mounts. Both SHALL stop on any terminal action (accept, decline, cancel, timeout).

#### Scenario: Incoming call screen mounts
- **WHEN** IncomingCallScreen mounts
- **THEN** callAudioService.startRingtone() is called, which starts audio and vibration

#### Scenario: Callee accepts call
- **WHEN** the Accept button is tapped
- **THEN** callAudioService.stop() is called before navigating to CallScreen

#### Scenario: Call is auto-dismissed
- **WHEN** call_cancelled or call_timeout is received
- **THEN** callAudioService.stop() is called before dismissing the screen

### Requirement: Voice call audio mode
The system SHALL set the device audio mode to voice call when a call becomes active, ensuring audio is routed through the earpiece by default for audio calls, with optional speakerphone override.

#### Scenario: Call becomes active
- **WHEN** the call state transitions to 'active'
- **THEN** callAudioService.setVoiceMode() is called, routing audio to the earpiece

#### Scenario: User enables speakerphone
- **WHEN** the speaker toggle is activated in CallScreen
- **THEN** callAudioService.setSpeaker(true) is called and audio routes to the device speaker

#### Scenario: Call ends
- **WHEN** the call state transitions to 'ended' or 'failed'
- **THEN** callAudioService.stop() is called to restore default audio routing

### Requirement: callAudioService singleton
callAudioService SHALL be a module-level singleton that wraps react-native-incall-manager. It SHALL expose: startRingback(), startRingtone(), stop(), setVoiceMode(), setSpeaker(enabled: boolean). Calling stop() SHALL always be safe regardless of current audio state.

#### Scenario: stop() called when nothing is playing
- **WHEN** callAudioService.stop() is called without a prior start call
- **THEN** no error is thrown and the call completes without side effects
