'use client';

import { GameScreen } from '@/components/GameScreen';
import { Suspense } from 'react';

export default function GamePage() {
  return (
    <Suspense
      fallback={
        <main className="page-bg flex min-h-screen items-center justify-center">
          <p className="text-white/50">Loading game…</p>
        </main>
      }
    >
      <GameScreen />
    </Suspense>
  );
}
