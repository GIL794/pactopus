import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pactopus — Solana Seeker dApp & Web Invoicing',
    short_name: 'Pactopus',
    description:
      'Non-custodial Solana & Solana Seeker USDC/EURC invoicing with atomic SPL fee splitting (0.25% max £5 on Seeker; 0.50% max £50 on Web) and HMRC-ready GBP accounting snapshots.',
    start_url: '/',
    display: 'standalone',
    background_color: '#07090E',
    theme_color: '#14F195',
    orientation: 'portrait-primary',
    categories: ['finance', 'business', 'productivity'],
    icons: [
      {
        src: '/logo.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/logo.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
