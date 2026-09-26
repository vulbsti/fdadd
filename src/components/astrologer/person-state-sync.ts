/** Invalidation only. Receivers must fetch current authenticated server state. */
export const PERSON_STATE_CHANGED = 'aidoraa:person-state-changed';

export function notifyPersonStateChanged(personId: string) {
  const detail = { personId, nonce: crypto.randomUUID() };
  window.dispatchEvent(new CustomEvent(PERSON_STATE_CHANGED, { detail }));
  try { window.localStorage.setItem(PERSON_STATE_CHANGED, JSON.stringify(detail)); }
  catch { /* Focus/visibility refresh still works if storage is unavailable. */ }
}

export function subscribePersonState(personId: string, refresh: () => void) {
  const changed = (value: unknown) => {
    if (value && typeof value === 'object' && 'personId' in value && value.personId === personId) refresh();
  };
  const sameTab = (event: Event) => changed((event as CustomEvent).detail);
  const otherTab = (event: StorageEvent) => {
    if (event.key !== PERSON_STATE_CHANGED || !event.newValue) return;
    try { changed(JSON.parse(event.newValue)); } catch { /* Ignore malformed invalidations. */ }
  };
  window.addEventListener(PERSON_STATE_CHANGED, sameTab);
  window.addEventListener('storage', otherTab);
  return () => {
    window.removeEventListener(PERSON_STATE_CHANGED, sameTab);
    window.removeEventListener('storage', otherTab);
  };
}
