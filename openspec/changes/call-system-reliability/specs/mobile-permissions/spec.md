## ADDED Requirements

### Requirement: Android manifest declares call-related permissions
`ChatApp/android/app/src/main/AndroidManifest.xml` SHALL declare the following `<uses-permission>` elements: `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `BLUETOOTH`, `BLUETOOTH_CONNECT`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `FOREGROUND_SERVICE_CAMERA`, and `WAKE_LOCK`. The existing `INTERNET` permission SHALL remain.

#### Scenario: Manifest is parseable and includes all required permissions
- **WHEN** the APK is built from the updated manifest
- **THEN** `aapt dump permissions` lists `android.permission.CAMERA`, `android.permission.RECORD_AUDIO`, `android.permission.MODIFY_AUDIO_SETTINGS`, `android.permission.BLUETOOTH`, `android.permission.BLUETOOTH_CONNECT`, `android.permission.FOREGROUND_SERVICE`, `android.permission.FOREGROUND_SERVICE_MICROPHONE`, `android.permission.FOREGROUND_SERVICE_CAMERA`, `android.permission.WAKE_LOCK`, and `android.permission.INTERNET`

### Requirement: MainActivity can show over lockscreen
The `<activity android:name=".MainActivity" ...>` element SHALL include `android:showWhenLocked="true"` and `android:turnScreenOn="true"` so the incoming-call screen can surface over the lockscreen when the FCM push triggers a navigation.

#### Scenario: Device locked during incoming call
- **GIVEN** the device screen is off and locked
- **AND** the app is backgrounded with a valid session
- **WHEN** an FCM incoming-call push arrives and the app navigates to `IncomingCallModal`
- **THEN** the MainActivity surfaces above the lockscreen without requiring manual unlock

### Requirement: Runtime permission request for microphone on every call
`WebRTCService.getLocalStream` SHALL request `PERMISSIONS.ANDROID.RECORD_AUDIO` via `requestMultiple` from `react-native-permissions` before invoking `mediaDevices.getUserMedia`. The request SHALL happen for both audio and video calls.

#### Scenario: Audio call requests only microphone permission
- **GIVEN** the user taps the audio call button
- **WHEN** `webrtcService.getLocalStream('audio')` runs
- **THEN** `requestMultiple([PERMISSIONS.ANDROID.RECORD_AUDIO])` is called
- **AND** `PERMISSIONS.ANDROID.CAMERA` is NOT requested

#### Scenario: Video call requests microphone and camera
- **GIVEN** the user taps the video call button
- **WHEN** `webrtcService.getLocalStream('video')` runs
- **THEN** `requestMultiple([PERMISSIONS.ANDROID.RECORD_AUDIO, PERMISSIONS.ANDROID.CAMERA])` is called

### Requirement: Permission denial prevents getUserMedia call
`WebRTCService.getLocalStream` SHALL throw a descriptive `Error` whose message names the denied permission BEFORE calling `mediaDevices.getUserMedia` when any requested permission returns a result that is not `RESULTS.GRANTED`.

#### Scenario: User denies microphone permission
- **GIVEN** the user is prompted for microphone permission
- **WHEN** the user denies the permission
- **THEN** `getLocalStream` throws `Error` with message containing `RECORD_AUDIO` (or `Microphone`)
- **AND** `mediaDevices.getUserMedia` is NOT invoked
- **AND** the peer connection is not created with null tracks

#### Scenario: User denies camera permission on a video call
- **GIVEN** microphone is granted and camera is denied on a video call
- **WHEN** `getLocalStream('video')` completes the request
- **THEN** `getLocalStream` throws `Error` with message containing `CAMERA`
- **AND** `mediaDevices.getUserMedia` is NOT invoked

### Requirement: Permission errors surface to caller
When `WebRTCService.getLocalStream` throws due to a denied permission, the calling code (including `useWebRTC` and `CallScreen`) SHALL transition the call state to `ended` or `failed` and display a user-facing error rather than leaving the UI in a loading state.

#### Scenario: Permission denied during call setup
- **GIVEN** the user initiates a call
- **WHEN** `getLocalStream` throws a permission denial
- **THEN** the call state transitions away from `initiating`
- **AND** the user sees an error indicating the permission is required

### Requirement: Runtime permission guard is Android-only
The `requestMultiple` call SHALL be guarded by a `Platform.OS === 'android'` check. On non-Android platforms, the permission request SHALL be skipped and `getUserMedia` proceeds directly.

#### Scenario: Non-Android platform
- **GIVEN** `Platform.OS` returns a value other than `android`
- **WHEN** `getLocalStream` runs
- **THEN** `requestMultiple` is NOT called
- **AND** `mediaDevices.getUserMedia` runs directly
