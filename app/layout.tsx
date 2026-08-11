import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { FULL_MOTION_BOOT_SCRIPT } from '@/lib/tradeup/motionPreference';
import './globals.css';
import './game-ui.css';

export const metadata: Metadata = {
  title: '$1B RUN',
  description: 'Build your five. Reach one billion dollars.',
  applicationName: '$1B RUN',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '$1B RUN',
  },
  openGraph: {
    title: '$1B RUN',
    description: 'Build your five. Reach one billion dollars.',
    type: 'website',
  },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#031942',
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
      style={{ background: '#061018' }}
    >
      <head>
        <link rel="preload" as="image" href="/images/1b-splash.png?v=2" />
        <link rel="preload" as="image" href="/images/1b-logo.png?v=2" />
        <meta name="theme-color" content="#061018" />
        <script dangerouslySetInnerHTML={{ __html: FULL_MOTION_BOOT_SCRIPT }} />
      </head>
      <body className="antialiased" style={{ background: '#061018' }}>
        {children}
      </body>
    </html>
  );
}
