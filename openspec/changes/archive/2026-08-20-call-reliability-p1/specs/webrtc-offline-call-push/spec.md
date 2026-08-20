## ADDED Requirements

### Requirement: Caller ringback lifecycle gated by server confirmation
The mobile caller (`WebRTCService`) SHALL NOT produce audible ringback as a side-effect of *sending* `call_initiate`; it SHALL start ringback only upon receiving `call_initiated` for that call. On receipt of `call_busy`, `call_missed` (any reason including `User unreachable`), or `error` (code 410) before the call is established, the service SHALL stop ringback immediately (idempotent) so no transient tone is audible. This guarantees a rejected/unreachable call never produces an audible ringback, while an accepted/online call still hears ringback starting right after `call_initiated`.

#### Scenario: Busy callee produces no ringback
- **WHEN** the caller emits `call_initiate` toward a callee whose `active_calls` set is non-empty and the server replies `call_busy` without ever sending `call_initiated`
- **THEN** the caller never hears ringback for that attempt

#### Scenario: Immediate-missed callee produces no ringback
- **WHEN** the caller emits `call_initiate` targeting an offline callee with zero FCM tokens and the server replies `call_missed {reason: 'User unreachable'}` without ever sending `call_initiated`
- **THEN** the caller never hears ringback for that attempt

#### Scenario: Stale-session error stops any tone
- **WHEN** the caller receives `error {code: 410}` for its session before the call is established
- **THEN** ringback is stopped immediately if running, and never started if not

#### Scenario: Successful call hears ringback after call_initiated
- **WHEN** the caller emits `call_initiate` toward an available callee and the server replies `call_initiated`
- **THEN** ringback starts after `call_initiated` is received and plays until `call_accepted` (which switches to voice mode) or a terminal event stops it
