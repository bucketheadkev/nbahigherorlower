import { SHOT_CLOCK_SECONDS } from '../types';
import './ShotClockBar.css';

interface Props {
  secondsLeft: number;
}

export function ShotClockBar({ secondsLeft }: Props) {
  const pct = (secondsLeft / SHOT_CLOCK_SECONDS) * 100;
  const urgent = secondsLeft <= 5;
  const display = Math.ceil(secondsLeft);

  return (
    <div className={`shot-clock ${urgent ? 'shot-clock-urgent' : ''}`}>
      <div className="shot-clock-header">
        <span className="shot-clock-label">Shot Clock</span>
        <span className="shot-clock-time">{display}s</span>
      </div>
      <div className="shot-clock-track">
        <div className="shot-clock-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
