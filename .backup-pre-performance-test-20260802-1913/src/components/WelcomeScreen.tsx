import type { HighScore } from '../types';
import { RANK_REQUIREMENTS, TIER_LABELS } from '../engine/scoring';
import { TierBadge } from './TierBadge';
import './WelcomeScreen.css';

interface Props {
  highScore: HighScore | null;
  onStart: () => void;
}

export function WelcomeScreen({ highScore, onStart }: Props) {
  return (
    <div className="welcome">
      <div className="welcome-hero">
        <p className="welcome-tag">NBA Trivia · Beat the Clock</p>
        <h1 className="welcome-title">
          SHOT <span className="accent">CLOCK</span>
        </h1>
        <p className="welcome-sub">
          Rapid-fire NBA questions under a 24-second shot clock. Your rank blends
          how many you get right with how fast you answer.
        </p>
      </div>

      <div className="welcome-rules card">
        <h2>How It Works</h2>
        <ul>
          <li>
            <strong>Get answers right</strong> — correct count is half the battle
          </li>
          <li>
            <strong>Answer fast</strong> — speed grades (S–D) boost your rank
          </li>
          <li>
            <strong>3 lives</strong> — wrong answers and timeouts cost a life
          </li>
          <li>
            <strong>Climb tiers</strong> — need both volume and speed for S-rank
          </li>
        </ul>
      </div>

      <div className="welcome-tier-key card">
        <h3>Rank Requirements</h3>
        <p className="tier-key-note">More correct answers unlock higher rank ceilings.</p>
        {RANK_REQUIREMENTS.map(({ tier, correct }) => (
          <div key={tier} className="tier-key-row">
            <TierBadge tier={tier} size="sm" />
            <span>{correct}+ correct to reach {tier}-rank</span>
          </div>
        ))}
        <p className="tier-key-note">Within each ceiling, speed and accuracy set your final grade.</p>
      </div>

      {highScore && (
        <div className="welcome-best card">
          <span className="best-label">Personal Best</span>
          <TierBadge tier={highScore.tier} size="lg" label={TIER_LABELS[highScore.tier]} />
          <span className="best-streak">{highScore.correct} correct · {highScore.streak} streak</span>
        </div>
      )}

      <button className="btn btn-primary welcome-start" onClick={onStart}>
        Tip Off
      </button>

      <p className="welcome-footnote">150+ players · 30 teams · 1960s–2020s</p>
    </div>
  );
}
