'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function SiteHeader() {
  const pathname = usePathname();

  const linkClass = (href: string) =>
    `text-sm font-medium transition ${
      pathname === href ? 'text-white' : 'text-white/50 hover:text-white'
    }`;

  return (
    <header className="site-header">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="brand-lockup">
          <span className="brand-mark">🏀</span>
          <span className="brand-text">
            <span className="brand-title">NBA Higher or Lower</span>
            <span className="brand-sub">Streak challenge</span>
          </span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link href="/" className={linkClass('/')}>
            Play
          </Link>
          <Link href="/#leaderboard" className={linkClass('/')}>
            Leaderboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
