'use client';

import { buildCopyText, buildShareUrl } from '@/lib/share';
import { useState } from 'react';

interface ShareButtonProps {
  streak: number;
  variant?: 'primary' | 'secondary';
}

export function ShareButton({ streak, variant = 'primary' }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    window.open(buildShareUrl(streak), '_blank', 'noopener,noreferrer');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildCopyText(streak));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const primaryClass =
    variant === 'primary'
      ? 'bg-orange-500 text-black hover:bg-orange-400'
      : 'border border-white/20 bg-white/5 text-white hover:bg-white/10';

  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row">
      <button type="button" onClick={handleShare} className={`btn-action flex-1 ${primaryClass}`}>
        Share to X
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="btn-action flex-1 border border-white/20 bg-white/5 text-white hover:bg-white/10"
      >
        {copied ? 'Copied!' : 'Copy Result'}
      </button>
    </div>
  );
}
