// filepath: /home/utka/proj/t_pro/fdadd/src/lib/platform.ts

/**
 * Detects the current deployment platform
 * @returns The current platform: 'vercel', 'firebase', or 'local'
 */
export function detectPlatform(): 'vercel' | 'firebase' | 'local' {
  // Check for environment variables that indicate the platform
  if (process.env.VERCEL) return 'vercel';
  if (process.env.FIREBASE_CONFIG) return 'firebase';
  
  // Override with manual setting if provided
  if (process.env.PLATFORM === 'vercel') return 'vercel';
  if (process.env.PLATFORM === 'firebase') return 'firebase';
  
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
    isFirebase: platform === 'firebase',
    isLocal: platform === 'local',
    platform
  };
}
