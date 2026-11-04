export function detectPlatform(): 'vercel' | 'local' {
  if (process.env.VERCEL) return 'vercel';

  if (process.env.PLATFORM === 'vercel') return 'vercel';

  return 'local';
}

export function getPlatformConfig() {
  const platform = detectPlatform();

  return {
    isVercel: platform === 'vercel',
    isLocal: platform === 'local',
    platform
  };
}
