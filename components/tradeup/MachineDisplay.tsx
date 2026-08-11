'use client';

import { memo } from 'react';
import { BALLION_LOGO_SRC } from './TradeUpLogo';

interface MachineDisplayProps {
  logoSource?: string;
}

/** Compact top display — logo only on dark glass. */
export const MachineDisplay = memo(function MachineDisplay({
  logoSource = BALLION_LOGO_SRC,
}: MachineDisplayProps) {
  return (
    <div className="btm-display" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="btm-display__logo"
        src={logoSource}
        alt=""
        draggable={false}
      />
    </div>
  );
});
