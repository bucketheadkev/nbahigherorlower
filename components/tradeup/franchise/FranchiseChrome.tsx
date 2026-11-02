'use client';

import { fmtCash } from '@/lib/tradeup/franchise/format';

export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="fx-icon-btn" aria-label={label} onClick={onClick}>
      <svg viewBox="0 0 10 16" width="9" height="14" fill="none" aria-hidden>
        <path d="M8 2 2 8l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function InfoButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="fx-icon-btn fx-icon-btn--info" aria-label={label} onClick={onClick}>
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 9v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="10" cy="6" r="1.2" fill="currentColor" />
      </svg>
    </button>
  );
}

export function BankChip({ amount }: { amount: number }) {
  return (
    <span className="fx-bank" aria-label={`Bank ${fmtCash(amount)}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/home-v2/money.png" alt="" aria-hidden />
      <strong>{fmtCash(amount)}</strong>
    </span>
  );
}
