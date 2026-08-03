'use client';

import { useCallback, useEffect, useState } from 'react';
import type { StartingTier } from '@/lib/tradeup/types';
import { getStoreOffer } from '@/lib/tradeup/credits';
import {
  addCredits as persistAddCredits,
  addOwnedStartingTier,
  getCredits,
  getOwnedStartingTiers,
  getStartingTier,
  isStartingTierOwned,
  saveCredits,
  spendCredits as persistSpendCredits,
  sanitizeStartingTierState,
  setStartingTier as persistStartingTier,
} from '@/lib/tradeup/storage';

export function useCredits() {
  const [credits, setCredits] = useState(0);
  const [startingTier, setStartingTierState] = useState<StartingTier>('F');
  const [ownedStartingTiers, setOwnedStartingTiers] = useState<StartingTier[]>(['F']);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    sanitizeStartingTierState();
    setCredits(getCredits());
    setStartingTierState(getStartingTier());
    setOwnedStartingTiers(getOwnedStartingTiers());
  }, []);

  useEffect(() => {
    try {
      refresh();
    } catch (error) {
      console.error('Failed to load credits', error);
    } finally {
      // Always leave the boot loading screen, even if storage throws.
      setReady(true);
    }
  }, [refresh]);

  const addCredits = useCallback((amount: number) => {
    const next = persistAddCredits(amount);
    setCredits(next);
    return next;
  }, []);

  const spendCredits = useCallback((amount: number) => {
    const result = persistSpendCredits(amount);
    if (result.success) {
      setCredits(result.balance);
    }
    return result;
  }, []);

  const equipStartingTier = useCallback((tier: StartingTier): boolean => {
    sanitizeStartingTierState();
    if (!isStartingTierOwned(tier)) return false;
    persistStartingTier(tier);
    setStartingTierState(tier);
    return true;
  }, []);

  const purchaseStartingTier = useCallback((tier: StartingTier, cost: number): boolean => {
    if (tier === 'F') return false;
    sanitizeStartingTierState();
    if (isStartingTierOwned(tier)) return false;

    const balance = getCredits();
    if (balance < cost) return false;

    const nextBalance = saveCredits(balance - cost);
    addOwnedStartingTier(tier);
    setCredits(nextBalance);
    setOwnedStartingTiers(getOwnedStartingTiers());
    return true;
  }, []);

  const purchaseStartingTierById = useCallback((tier: StartingTier): boolean => {
    const offer = getStoreOffer(tier);
    if (!offer || offer.included || offer.cost <= 0) return false;
    return purchaseStartingTier(tier, offer.cost);
  }, [purchaseStartingTier]);

  return {
    credits,
    startingTier,
    ownedStartingTiers,
    ready,
    refresh,
    addCredits,
    spendCredits,
    equipStartingTier,
    purchaseStartingTier,
    purchaseStartingTierById,
  };
}
