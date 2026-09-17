import type { NextConfig } from 'next';

const forCapacitor = process.env.CAPACITOR_BUILD === '1';

const nextConfig: NextConfig = {
  // Static export only when building for the native Capacitor shell.
  ...(forCapacitor ? { output: 'export' as const } : {}),
  // Allow phone/other devices on the same Wi-Fi to load dev assets (/_next/*).
  // Also allow 127.0.0.1 — Next treats it as cross-origin vs localhost.
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '192.168.1.197',
    '192.168.1.197:3000',
    '192.168.1.232',
    '192.168.1.232:3000',
  ],
  outputFileTracingRoot: process.cwd(),
  images: {
    // Required for static export / Capacitor; fine for local web play too.
    unoptimized: true,
  },
  async rewrites() {
    // Capacitor static export cannot rewrite. Native invites use the app link.
    // On the website, /join/CODE must render the game, not a 404 navy page.
    if (forCapacitor) return [];
    return [
      { source: '/join/:code', destination: '/' },
      { source: '/join', destination: '/' },
    ];
  },
};

export default nextConfig;
