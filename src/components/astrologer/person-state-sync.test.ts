import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { notifyPersonStateChanged, PERSON_STATE_CHANGED, subscribePersonState } from './person-state-sync';

const setItem = vi.fn();
beforeEach(() => {
  setItem.mockReset();
  vi.stubGlobal('window', Object.assign(new EventTarget(), { localStorage: { setItem } }));
});
afterEach(() => vi.unstubAllGlobals());

function storage(value: string, key = PERSON_STATE_CHANGED) {
  window.dispatchEvent(Object.assign(new Event('storage'), { key, newValue: value }));
}

it('announces only a person-scoped invalidation, not a permission value', () => {
  const refresh = vi.fn();
  const stop = subscribePersonState('person-a', refresh);
  notifyPersonStateChanged('person-a');
  expect(refresh).toHaveBeenCalledOnce();
  const [key, raw] = setItem.mock.calls[0];
  expect(key).toBe(PERSON_STATE_CHANGED);
  expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['nonce', 'personId']);
  stop();
  notifyPersonStateChanged('person-a');
  expect(refresh).toHaveBeenCalledOnce();
});

it('refreshes another tab only for a valid matching person notification', () => {
  const refresh = vi.fn();
  const stop = subscribePersonState('person-a', refresh);
  storage('broken');
  storage('null');
  storage(JSON.stringify({ personId: 'person-b' }));
  storage(JSON.stringify({ personId: 'person-a' }), 'unrelated');
  expect(refresh).not.toHaveBeenCalled();
  storage(JSON.stringify({ personId: 'person-a', astrologyEnabled: true }));
  expect(refresh).toHaveBeenCalledOnce(); // callback must re-read server authority
  stop();
  storage(JSON.stringify({ personId: 'person-a' }));
  expect(refresh).toHaveBeenCalledOnce();
});

it('does not make a committed setting fail when browser storage is unavailable', () => {
  setItem.mockImplementation(() => { throw new Error('storage unavailable'); });
  expect(() => notifyPersonStateChanged('person-a')).not.toThrow();
});
