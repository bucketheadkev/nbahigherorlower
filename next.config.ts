import type { NextConfig } from 'next';

const forCapacitor = process.env.CAPACITOR_BUILD === '1';

const nextConfig: NextConfig = {
  // Static export only when building for the native Capacitor shell.
  ...(forCapacitor ? { output: 'export' as const } : {}),
  // Allow phone/other devices on the same Wi-Fi to load dev assets (/_next/*).
  allowedDevOrigins: [
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
};

export default nextConfig;
