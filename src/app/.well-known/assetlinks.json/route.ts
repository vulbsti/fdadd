import { parseFingerprints } from './fingerprints';

// Read the env var at request time so the Play App Signing fingerprint can be
// added without a rebuild.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.aidoraa.app',
        sha256_cert_fingerprints: parseFingerprints(process.env.ANDROID_CERT_SHA256_FINGERPRINTS),
      },
    },
  ]);
}
