import { describe, expect, it, vi } from 'vitest';
import { preparePiInitialization, withPiPreparationLock, type PiInitializationDependencies, type PiInitializationState } from './pi-initialization';

const marker = '{"protocol":"universal:init-v2","bundle":"pinned","atros":"pinned"}';
function fixture() {
  const events: string[] = [];
  const state: PiInitializationState = { prepared: false, dataPhase: false, hasWorkspaceData: false, readyMarker: null };
  let runtimeReady = false;
  let atrosReady = false;
  const deps = {
    readState: vi.fn(async () => ({ ...state })),
    runtimeReady: vi.fn(async () => { events.push('probe-runtime'); return runtimeReady; }),
    atrosReady: vi.fn(async () => { events.push('probe-atros'); return atrosReady; }),
    installRuntime: vi.fn(async () => { events.push('install-runtime'); runtimeReady = true; }),
    installAtros: vi.fn(async () => { events.push('install-atros'); atrosReady = true; }),
    writeReadyMarker: vi.fn(async (value: string) => { events.push('ready-marker'); state.readyMarker = value; }),
    sealNetwork: vi.fn(async () => { events.push('seal-network'); }),
    writeDataPhaseMarker: vi.fn(async () => { events.push('data-phase'); state.dataPhase = true; }),
  } satisfies PiInitializationDependencies;
  return { deps, state, events, ready() { runtimeReady = true; atrosReady = true; } };
}
const initialize = (deps: PiInitializationDependencies, needsAtros = true) => preparePiInitialization({ readyMarker: marker, needsAtros }, deps);

describe('replay-safe Pi sandbox initialization', () => {
  it('verifies both installs, commits readiness, seals egress, then marks the private-data phase', async () => {
    const f = fixture();
    expect(await initialize(f.deps)).toEqual({ alreadyPrepared: false });
    expect(f.events).toEqual(['probe-runtime', 'probe-atros', 'install-runtime', 'install-atros',
      'probe-runtime', 'probe-atros', 'ready-marker', 'seal-network', 'data-phase']);
    expect(f.state.readyMarker).toBe(marker);
    expect(f.state.dataPhase).toBe(true);
  });

  it('retries a clean VM after Atros initialization fails without trusting VM existence', async () => {
    const f = fixture();
    f.deps.installAtros.mockRejectedValueOnce(new Error('synthetic installer failure'));
    await expect(initialize(f.deps)).rejects.toThrow('synthetic installer failure');
    expect(f.deps.writeReadyMarker).not.toHaveBeenCalled();
    expect(f.deps.sealNetwork).not.toHaveBeenCalled();
    expect(f.deps.writeDataPhaseMarker).not.toHaveBeenCalled();
    await expect(initialize(f.deps)).resolves.toEqual({ alreadyPrepared: false });
    expect(f.deps.installRuntime).toHaveBeenCalledTimes(1);
    expect(f.deps.installAtros).toHaveBeenCalledTimes(2);
    expect(f.deps.writeReadyMarker).toHaveBeenCalledTimes(1);
  });

  it.each(['prepared', 'dataPhase', 'hasWorkspaceData'] as const)(
    'fails closed when a %s VM has broken readiness; it never installs or changes networking', async (field) => {
      const f = fixture();
      f.state[field] = true;
      await expect(initialize(f.deps)).rejects.toThrow('refusing installation or network widening');
      expect(f.deps.installRuntime).not.toHaveBeenCalled();
      expect(f.deps.installAtros).not.toHaveBeenCalled();
      expect(f.deps.writeReadyMarker).not.toHaveBeenCalled();
      expect(f.deps.sealNetwork).not.toHaveBeenCalled();
      expect(f.deps.writeDataPhaseMarker).not.toHaveBeenCalled();
    },
  );

  it('prepared replay only probes readiness and refreshes the restricted broker policy', async () => {
    const f = fixture();
    f.ready(); f.state.prepared = true;
    // Missing install marker cannot authorize setup; verified readiness may
    // serve an existing prepared VM without writing any new files.
    await expect(initialize(f.deps)).resolves.toEqual({ alreadyPrepared: true });
    expect(f.events).toEqual(['probe-runtime', 'probe-atros', 'seal-network']);
    expect(f.deps.installRuntime).not.toHaveBeenCalled();
    expect(f.deps.installAtros).not.toHaveBeenCalled();
    expect(f.deps.writeReadyMarker).not.toHaveBeenCalled();
    expect(f.deps.writeDataPhaseMarker).not.toHaveBeenCalled();
  });

  it('cannot reuse another initialization marker after private data', async () => {
    const f = fixture();
    f.ready(); f.state.dataPhase = true; f.state.readyMarker = 'old-image-or-bundle';
    await expect(initialize(f.deps)).rejects.toThrow('readiness is invalid');
    expect(f.deps.writeReadyMarker).not.toHaveBeenCalled();
    expect(f.deps.installRuntime).not.toHaveBeenCalled();
    expect(f.deps.installAtros).not.toHaveBeenCalled();
  });

  it('checks software on every retry even when a ready marker exists', async () => {
    const f = fixture();
    f.state.readyMarker = marker;
    await initialize(f.deps);
    expect(f.deps.installRuntime).toHaveBeenCalledTimes(1);
    expect(f.deps.installAtros).toHaveBeenCalledTimes(1);
    expect(f.deps.writeReadyMarker).not.toHaveBeenCalled();
  });

  it('does not install or probe Atros when no permitted birth calculation is needed', async () => {
    const f = fixture();
    await initialize(f.deps, false);
    expect(f.deps.atrosReady).not.toHaveBeenCalled();
    expect(f.deps.installAtros).not.toHaveBeenCalled();
    expect(f.deps.installRuntime).toHaveBeenCalledTimes(1);
  });

  it('never marks the data phase when restricting networking fails', async () => {
    const f = fixture();
    f.deps.sealNetwork.mockRejectedValueOnce(new Error('synthetic network failure'));
    await expect(initialize(f.deps)).rejects.toThrow('synthetic network failure');
    expect(f.deps.writeReadyMarker).toHaveBeenCalledTimes(1);
    expect(f.deps.writeDataPhaseMarker).not.toHaveBeenCalled();
  });

  it('cannot return success before the data-phase marker is committed', async () => {
    const f = fixture();
    f.deps.writeDataPhaseMarker.mockRejectedValueOnce(new Error('synthetic marker failure'));
    await expect(initialize(f.deps)).rejects.toThrow('synthetic marker failure');
    expect(f.deps.sealNetwork).toHaveBeenCalledTimes(1);
    expect(f.state.dataPhase).toBe(false);
  });

  it('refuses to commit setup if an overlapping preparation entered the data phase', async () => {
    const f = fixture();
    f.deps.readState.mockResolvedValueOnce({ ...f.state }).mockResolvedValueOnce({ ...f.state, hasWorkspaceData: true });
    await expect(initialize(f.deps)).rejects.toThrow('entered the private-data phase');
    expect(f.deps.writeReadyMarker).not.toHaveBeenCalled();
    expect(f.deps.sealNetwork).not.toHaveBeenCalled();
    expect(f.deps.writeDataPhaseMarker).not.toHaveBeenCalled();
  });

  it('refuses a successful installer exit when the subsequent probe remains broken', async () => {
    const f = fixture();
    f.deps.runtimeReady.mockResolvedValue(false);
    await expect(initialize(f.deps)).rejects.toThrow('did not establish runtime readiness');
    expect(f.deps.writeReadyMarker).not.toHaveBeenCalled();
    expect(f.deps.sealNetwork).not.toHaveBeenCalled();
    expect(f.deps.writeDataPhaseMarker).not.toHaveBeenCalled();
  });
});

describe('Pi preparation serialization', () => {
  it('holds the lock through config commit so an overlapping attempt never enters preparation', async () => {
    let locked = false;
    let finish: () => void = () => {};
    const configCommit = new Promise<void>((resolve) => { finish = resolve; });
    const lock = { acquire: vi.fn(async () => { if (locked) return false; locked = true; return true; }),
      release: vi.fn(async () => { locked = false; }) };
    const first = withPiPreparationLock(lock, async () => { await configCommit; return 'committed'; });
    await Promise.resolve();
    const overlap = vi.fn(async () => 'unsafe overlapping setup');
    await expect(withPiPreparationLock(lock, overlap)).rejects.toThrow('already in progress');
    expect(overlap).not.toHaveBeenCalled();
    expect(lock.release).not.toHaveBeenCalled();
    finish();
    expect(await first).toBe('committed');
    expect(lock.release).toHaveBeenCalledTimes(1);
    await expect(withPiPreparationLock(lock, async () => 'safe replay')).resolves.toBe('safe replay');
  });

  it('releases an owned lock after installer failure so a clean VM can retry', async () => {
    const lock = { acquire: vi.fn(async () => true), release: vi.fn(async () => {}) };
    await expect(withPiPreparationLock(lock, async () => { throw new Error('synthetic setup failed'); })).rejects.toThrow('setup failed');
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  it('never releases an abandoned or foreign lock it could not acquire', async () => {
    const lock = { acquire: vi.fn(async () => false), release: vi.fn(async () => {}) };
    const prepare = vi.fn(async () => 'unused');
    await expect(withPiPreparationLock(lock, prepare)).rejects.toThrow('retry without changing its network or files');
    expect(prepare).not.toHaveBeenCalled();
    expect(lock.release).not.toHaveBeenCalled();
  });
});
