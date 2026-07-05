import type { Metadata } from 'next';
import { DM_Sans, Syne } from 'next/font/google';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
});

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
});

export const metadata: Metadata = {
  title: 'NBA Higher or Lower — Test Your NBA Knowledge',
  description:
    'Play NBA Higher or Lower. Compare NBA legends and current stars by points, rings, assists, earnings, followers, and more.',
  openGraph: {
    title: 'NBA Higher or Lower — Test Your NBA Knowledge',
    description:
      'Play NBA Higher or Lower. Compare NBA legends and current stars by points, rings, assists, earnings, followers, and more.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${syne.variable} antialiased`}>{children}</body>
    </html>
  );
}
