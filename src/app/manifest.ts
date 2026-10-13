import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Aidoraa',
    short_name: 'Aidoraa',
    description: 'Understand yourself, and everything that shapes you',
    start_url: '/astrologer',
    scope: '/',
    display: 'standalone',
    background_color: '#101827',
    theme_color: '#101827',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
