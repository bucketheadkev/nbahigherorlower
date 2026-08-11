'use client';

import { memo } from 'react';
import { BALLION_LOGO_SRC } from './TradeUpLogo';

interface BallionTicketProps {
  teamName: string;
  era: string;
  logoSource?: string;
  className?: string;
}

/** Flat lottery ticket — transparent logo + team + era only. */
export const BallionTicket = memo(function BallionTicket({
  teamName,
  era,
  logoSource = BALLION_LOGO_SRC,
  className = '',
}: BallionTicketProps) {
  return (
    <div
      className={`ballion-ticket${className ? ` ${className}` : ''}`}
      aria-label={`${teamName}, ${era}`}
    >
      <div className="ballion-ticket__logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSource} alt="" draggable={false} />
      </div>
      <div className="ballion-ticket__body">
        <p className="ballion-ticket__team">{teamName}</p>
        <p className="ballion-ticket__era">{era}</p>
      </div>
    </div>
  );
});
