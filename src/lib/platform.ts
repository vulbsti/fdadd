/**
 * Detects the current deployment platform
 * @returns The current platform: 'vercel' or 'local'
 */
export function detectPlatform(): 'vercel' | 'local' {
  // Check for environment variables that indicate the platform
  if (process.env.VERCEL) return 'vercel';

  // Override with manual setting if provided
  if (process.env.PLATFORM === 'vercel') return 'vercel';

  // Default to local
  return 'local';
}

/**
 * Returns platform-specific configuration options
 */
export function getPlatformConfig() {
  const platform = detectPlatform();

  return {
    isVercel: platform === 'vercel',
    isLocal: platform === 'local',
    platform
  };
}
