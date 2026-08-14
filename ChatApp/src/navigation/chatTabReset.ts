// ChatTab reset-to-Messages signal. The bottom-tab dock's ChatTab handler
// (MainNavigator) fires this instead of threading params through navigation.
// Emitting here is fire-and-forget: it never mutates navigation state, so it
// adds zero navigation-driven renders to the tab-switch frame. The params
// dance it replaces forced ChatHome's route object to change on every reset.
const listeners = new Set<() => void>();

export function requestChatHomeReset() {
  listeners.forEach((l) => l());
}

export function onChatHomeReset(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
