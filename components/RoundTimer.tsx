'use client';

interface RoundTimerProps {
  secondsLeft: number;
  totalSeconds: number;
  urgent?: boolean;
}

export function RoundTimer({ secondsLeft, totalSeconds, urgent = false }: RoundTimerProps) {
  const progress = Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className={`round-timer ${urgent ? 'round-timer--urgent' : ''}`}>
      <div className="round-timer-track" aria-hidden>
        <div className="round-timer-fill" style={{ width: `${progress}%` }} />
      </div>
      <p className="round-timer-label">
        <span className="round-timer-icon" aria-hidden>
          ⏱
        </span>
        {display}
      </p>
    </div>
  );
}
