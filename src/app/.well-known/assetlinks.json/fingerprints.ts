/** SHA-256 fingerprint of the Android upload key for com.aidoraa.app. */
export const UPLOAD_KEY_SHA256 =
  '72:CD:54:6C:72:F5:7B:AC:07:9D:9A:86:77:3C:EE:C5:F0:B7:12:C8:A6:7D:8C:EF:BA:F8:64:FE:CE:54:55:06';

/**
 * Upload key plus any comma-separated extras (e.g. the Play App Signing key),
 * trimmed, uppercased and deduplicated.
 */
export function parseFingerprints(extra: string | undefined): string[] {
  const all = [UPLOAD_KEY_SHA256, ...(extra ?? '').split(',')]
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  return [...new Set(all)];
}
