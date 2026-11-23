/**
 * Pure helpers for Bank Money display gating (Fix F).
 * Keeps startup / account-switch UI from flashing the wrong balance.
 */

import type { AccountAuthState } from '@/lib/account/accountAuth';

export type BankAuthStatus = AccountAuthState['status'];

export function isBankAuthLoading(status: BankAuthStatus): boolean {
  return status === 'loading' || status === 'unavailable';
}

/** Only permanent accounts read the server Bank ledger for display. */
export function isBankPermanent(status: BankAuthStatus): boolean {
  return status === 'permanent';
}

/**
 * Guest/anonymous device Bank is only used once auth has resolved and the
 * player is not a permanent account. Never while status is still loading.
 */
export function shouldUseGuestBank(status: BankAuthStatus): boolean {
  if (isBankAuthLoading(status)) return false;
  return !isBankPermanent(status);
}

/** Cached server balance is usable only for the same authenticated user. */
export function balanceFromCacheForUser(
  cached: { userId: string; balance: number } | null | undefined,
  userId: string | null | undefined,
): number | null {
  if (!cached || !userId) return null;
  if (cached.userId !== userId) return null;
  if (!Number.isFinite(cached.balance) || cached.balance < 0) return null;
  return Math.floor(cached.balance);
}
