import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { FULL_MOTION_BOOT_SCRIPT } from '@/lib/tradeup/motionPreference';
import './globals.css';
import './game-ui.css';

export const metadata: Metadata = {
  title: 'Trade Up',
  description: 'Start with one NBA player. Trade your way to a superstar.',
  applicationName: 'Trade Up',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Trade Up',
  },
  openGraph: {
    title: 'Trade Up',
    description: 'Start with one NBA player. Trade your way to a superstar.',
    type: 'website',
  },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#050B1F',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: FULL_MOTION_BOOT_SCRIPT }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
