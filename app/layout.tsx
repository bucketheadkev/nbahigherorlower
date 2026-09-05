import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { FULL_MOTION_BOOT_SCRIPT } from '@/lib/tradeup/motionPreference';
import './globals.css';
import './game-ui.css';
import './oneb-theme.css';
import './run-home-ipad-portrait.css';
import './h2h-ipad-portrait.css';

export const metadata: Metadata = {
  title: '1B Run',
  description: 'Build your five. Reach one billion dollars.',
  applicationName: '1B Run',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '1B Run',
  },
  openGraph: {
    title: '1B Run',
    description: 'Build your five. Reach one billion dollars.',
    type: 'website',
  },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#010814',
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
      style={{ background: '#010814' }}
    >
      <head>
        <link rel="preload" as="image" href="/images/1b-run-app-icon-squircle.png?v=1" />
        <meta name="theme-color" content="#010814" />
        <style
          dangerouslySetInnerHTML={{
            __html: `
html,body{background:#010814!important}
.oneb-intro{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;background:#010814;pointer-events:auto;touch-action:none}
.oneb-intro__veil{position:absolute;inset:0;background:#010814}
.oneb-intro__studio{opacity:0;transform:scale(0.96)}
.oneb-intro__logo-stage{opacity:0;transform:scale(0.84)}
.oneb-intro__logo{width:100%;height:100%;display:block;object-fit:contain;background:transparent;-webkit-touch-callout:none;user-select:none}
.ballion-splash{position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;padding:0;background:#010814!important;opacity:1!important}
.ballion-splash__logo-wrap{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center}
.ballion-splash__mark{width:min(72vw,17.5rem);aspect-ratio:1/1;border-radius:22.37%;overflow:hidden}
.ballion-splash__logo{width:100%!important;height:100%!important;display:block;object-fit:contain;background:transparent!important;opacity:1!important;transform:none!important;border-radius:0!important;-webkit-touch-callout:none;user-select:none;-webkit-user-select:none}
.run-home{position:relative;overflow:hidden;min-height:100dvh;background:#010814}
.run-home__ui{position:relative;z-index:2}
`.replace(/\n/g, ''),
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: FULL_MOTION_BOOT_SCRIPT }} />
      </head>
      <body className="antialiased" style={{ background: '#010814' }}>
        {children}
      </body>
    </html>
  );
}
