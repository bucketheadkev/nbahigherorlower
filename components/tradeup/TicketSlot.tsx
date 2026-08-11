'use client';

import { memo } from 'react';

interface TicketSlotProps {
  pulsing?: boolean;
}

/** Narrow recessed printer slot + teal light — no ticket compartment. */
export const TicketSlot = memo(function TicketSlot({
  pulsing = false,
}: TicketSlotProps) {
  return (
    <div className="btm-slot">
      <span
        className={`btm-slot__light${pulsing ? ' is-pulse' : ''}`}
        aria-hidden
      />
      <div className="btm-slot__mouth" aria-hidden />
    </div>
  );
});
