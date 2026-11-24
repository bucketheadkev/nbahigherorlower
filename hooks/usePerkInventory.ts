'use client';

import { useEffect, useState } from 'react';
import {
  EMPTY_PERK_INVENTORY,
  getPerkInventory,
  type PerkInventory,
} from '@/lib/tradeup/perkInventory';

/**
 * Perk shop inventory from localStorage — start empty so SSR and the first
 * client paint match, then load real counts after hydration.
 */
export function usePerkInventory(): PerkInventory {
  const [inv, setInv] = useState<PerkInventory>(EMPTY_PERK_INVENTORY);

  useEffect(() => {
    const refresh = () => setInv(getPerkInventory());
    refresh();
    window.addEventListener('oneb:perk-inventory', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('oneb:perk-inventory', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return inv;
}
