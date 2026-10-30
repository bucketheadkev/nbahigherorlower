/**
 * Guest Run Bonuses on this device: the same rules as the server. One bonus stays assigned until a
 * Classic run is completed (leaving a run never re-rolls it); a completed bonus pays once.
 */

import { appendLocalLedger, BANK_CHANGED_EVENT } from './bank';
import { isRunBonusId, pickRunBonus, RUN_BONUS_BY_ID, type RunBonusFacts, type RunBonusId } from './runBonuses';

const KEY = 'oneb_run_bonus_v1';

export interface LocalRunBonus {
  id: string;
  bonusId: RunBonusId;
}

export interface LocalRunBonusResult {
  bonusId: RunBonusId;
  completed: boolean;
  payout: number;
}

function read(): LocalRunBonus | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<LocalRunBonus> | null;
    return parsed && typeof parsed.id === 'string' && isRunBonusId(parsed.bonusId) ? (parsed as LocalRunBonus) : null;
  } catch {
    return null;
  }
}

/** The open bonus, created on first use. */
export function getLocalRunBonus(): LocalRunBonus | null {
  if (typeof window === 'undefined') return null;
  const current = read();
  if (current) return current;
  const next: LocalRunBonus = {
    id: `local_bonus_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    bonusId: pickRunBonus().id,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    return next;
  }
  return next;
}

/** Judges the finished run against the open bonus, pays once, and clears it for the next run. */
export function settleLocalRunBonus(facts: RunBonusFacts): LocalRunBonusResult | null {
  if (typeof window === 'undefined') return null;
  const open = read();
  if (!open) return null;
  const def = RUN_BONUS_BY_ID[open.bonusId];
  const completed = def.met(facts);
  const paid = completed && appendLocalLedger({ ref: open.id, amount: def.reward, kind: 'run_bonus' });
  localStorage.removeItem(KEY);
  if (paid) window.dispatchEvent(new Event(BANK_CHANGED_EVENT));
  return { bonusId: open.bonusId, completed, payout: completed ? def.reward : 0 };
}
