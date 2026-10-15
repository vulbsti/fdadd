import { describe, expect, it } from 'vitest';
import { appPlatform, appVersionGate, compareSemver, isUpdateRequired, minSupportedVersion, parseSemver } from './version';

const request = (headers: Record<string, string> = {}) => new Request('https://www.aidoraa.com/api/app/v1/bootstrap', { headers });

describe('app version gate', () => {
  it('reads plain and decorated versions', () => {
    expect(parseSemver('1.2.3')).toEqual([1, 2, 3]);
    expect(parseSemver('v2.0')).toEqual([2, 0, 0]);
    expect(parseSemver('1.4.0-beta.2+77')).toEqual([1, 4, 0]);
    expect(parseSemver('soon')).toBeNull();
    expect(compareSemver([1, 10, 0], [1, 9, 9])).toBe(1);
    expect(compareSemver([1, 0, 0], [1, 0, 0])).toBe(0);
  });

  it('defaults the minimum and ignores an unreadable one', () => {
    expect(minSupportedVersion({})).toBe('1.0.0');
    expect(minSupportedVersion({ APP_MIN_SUPPORTED_VERSION: ' 1.3.0 ' })).toBe('1.3.0');
    expect(minSupportedVersion({ APP_MIN_SUPPORTED_VERSION: 'latest' })).toBe('1.0.0');
  });

  it('never blocks a request without the header', () => {
    expect(isUpdateRequired(null, '9.0.0')).toBe(false);
    expect(appVersionGate(request(), { APP_MIN_SUPPORTED_VERSION: '9.0.0' })).toBeNull();
  });

  it('answers 426 to an older app build', async () => {
    expect(isUpdateRequired('1.2.9', '1.3.0')).toBe(true);
    expect(isUpdateRequired('1.3.0', '1.3.0')).toBe(false);
    expect(isUpdateRequired('garbage', '1.0.0')).toBe(true);
    const response = appVersionGate(request({ 'X-Aidoraa-App-Version': '1.0.4', 'X-Aidoraa-Platform': 'android' }),
      { APP_MIN_SUPPORTED_VERSION: '1.1.0' });
    expect(response?.status).toBe(426);
    expect(await response?.json()).toMatchObject({ code: 'update_required', minSupportedVersion: '1.1.0' });
    expect(appVersionGate(request({ 'X-Aidoraa-App-Version': '1.1.0' }), { APP_MIN_SUPPORTED_VERSION: '1.1.0' })).toBeNull();
  });

  it('recognises the two platforms only', () => {
    expect(appPlatform('Android')).toBe('android');
    expect(appPlatform('ios')).toBe('ios');
    expect(appPlatform('web')).toBeNull();
  });
});
