/** Bump with initialization ordering or sandbox image changes; also keys VM identity. */
export const PI_INITIALIZATION_PROTOCOL = 'vercel/sandbox/universal:init-v2';

export interface PiInitializationState {
  prepared: boolean;
  dataPhase: boolean;
  hasWorkspaceData: boolean;
  readyMarker: string | null;
}
export interface PiInitializationDependencies {
  readState(): Promise<PiInitializationState>;
  runtimeReady(): Promise<boolean>;
  atrosReady(): Promise<boolean>;
  installRuntime(): Promise<void>;
  installAtros(): Promise<void>;
  writeReadyMarker(marker: string): Promise<void>;
  sealNetwork(): Promise<void>;
  writeDataPhaseMarker(): Promise<void>;
}

/** The VM lock spans installation, network sealing, personal writes, and config commit. */
export async function withPiPreparationLock<T>(
  dependencies: { acquire(): Promise<boolean>; release(): Promise<void> },
  prepare: () => Promise<T>,
): Promise<T> {
  if (!await dependencies.acquire()) throw new Error('Pi sandbox preparation is already in progress; retry without changing its network or files.');
  try { return await prepare(); }
  finally { await dependencies.release(); }
}

/**
 * A failed creation callback may leave a reusable VM. Readiness is therefore
 * checked on every preparation, not inferred from getOrCreate/onCreate.
 * No dependency here can broaden egress. Once private data may exist, setup
 * writes/installers are forbidden; a broken prepared VM must be replaced.
 */
export async function preparePiInitialization(
  options: { readyMarker: string; needsAtros: boolean },
  dependencies: PiInitializationDependencies,
) {
  const state = await dependencies.readState();
  const protectedVm = state.prepared || state.dataPhase || state.hasWorkspaceData;
  const readiness = () => Promise.all([
    dependencies.runtimeReady(),
    options.needsAtros ? dependencies.atrosReady() : Promise.resolve(true),
  ]);
  let [runtimeReady, atrosReady] = await readiness();
  if (protectedVm) {
    if (!runtimeReady || !atrosReady || (state.readyMarker !== null && state.readyMarker !== options.readyMarker)) {
      throw new Error('Prepared Pi sandbox readiness is invalid; refusing installation or network widening after private data.');
    }
  } else {
    if (!runtimeReady) await dependencies.installRuntime();
    if (!atrosReady) await dependencies.installAtros();
    [runtimeReady, atrosReady] = await readiness();
    if (!runtimeReady || !atrosReady) throw new Error('Pi sandbox installation did not establish runtime readiness.');
    // Defense in depth under the preparation lock; this read alone is not
    // serialization and cannot protect installation against overlapping writes.
    const latest = await dependencies.readState();
    if (latest.prepared || latest.dataPhase || latest.hasWorkspaceData) {
      throw new Error('Pi sandbox entered the private-data phase during initialization; retry with verified readiness.');
    }
    if (state.readyMarker !== options.readyMarker) await dependencies.writeReadyMarker(options.readyMarker);
  }
  await dependencies.sealNetwork();
  // This marker precedes every personal/canonical/session/config write. A
  // partial write followed by retry can never be mistaken for a clean VM.
  if (!state.prepared && !state.dataPhase) await dependencies.writeDataPhaseMarker();
  return { alreadyPrepared: state.prepared };
}
