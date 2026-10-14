import { NextResponse } from 'next/server';

/**
 * The native app names itself on every call:
 *   X-Aidoraa-App-Version: 1.4.2
 *   X-Aidoraa-Platform: android | ios
 * The website sends neither header and is never turned away.
 */
export const APP_VERSION_HEADER = 'x-aidoraa-app-version';
export const APP_PLATFORM_HEADER = 'x-aidoraa-platform';
export const DEFAULT_MIN_SUPPORTED_VERSION = '1.0.0';

export type AppPlatform = 'android' | 'ios';

/** Major, minor and patch of a semantic version; pre-release and build parts are ignored. */
export function parseSemver(value: string | null | undefined): [number, number, number] | null {
  const match = /^v?(\d{1,6})\.(\d{1,6})(?:\.(\d{1,6}))?(?:[-+].*)?$/.exec(value?.trim() ?? '');
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : null;
}

export function compareSemver(a: [number, number, number], b: [number, number, number]): number {
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

export function minSupportedVersion(env: Record<string, string | undefined> = process.env): string {
  const configured = env.APP_MIN_SUPPORTED_VERSION?.trim();
  return configured && parseSemver(configured) ? configured : DEFAULT_MIN_SUPPORTED_VERSION;
}

export function appPlatform(value: string | null | undefined): AppPlatform | null {
  const platform = value?.trim().toLowerCase();
  return platform === 'android' || platform === 'ios' ? platform : null;
}

/**
 * True only when the app sent a version older than the minimum. No header (the
 * website) is never blocked; an unreadable version is treated as too old,
 * because only an app sends the header at all.
 */
export function isUpdateRequired(version: string | null | undefined, minimum: string): boolean {
  if (version == null || version.trim() === '') return false;
  const parsed = parseSemver(version);
  const floor = parseSemver(minimum) ?? parseSemver(DEFAULT_MIN_SUPPORTED_VERSION)!;
  return !parsed || compareSemver(parsed, floor) < 0;
}

/** For /api/app/v1/* routes: a 426 to return when this app build is too old, otherwise null. */
export function appVersionGate(request: Request, env: Record<string, string | undefined> = process.env): NextResponse | null {
  const minimum = minSupportedVersion(env);
  if (!isUpdateRequired(request.headers.get(APP_VERSION_HEADER), minimum)) return null;
  return NextResponse.json({
    code: 'update_required',
    message: 'A newer version of Aidoraa is available. Please update the app to keep going.',
    minSupportedVersion: minimum,
  }, { status: 426, headers: { 'cache-control': 'no-store' } });
}
