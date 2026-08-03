import { useState } from 'react';
import type { RunResult } from '../types';
import {
  buildShareText,
  countTiers,
  getCorrectCount,
  getRunBreakdown,
  TIER_LABELS,
  TIER_ORDER,
} from '../engine/scoring';
import { TierBadge } from './TierBadge';
import './ResultsScreen.css';

interface Props {
  result: RunResult;
  onPlayAgain: () => void;
  onHome: () => void;
}

export function ResultsScreen({ result, onPlayAgain, onHome }: Props) {
  const [copied, setCopied] = useState(false);
  const correct = getCorrectCount(result.tierHistory);
  const breakdown = getRunBreakdown(result.tierHistory);
  const shareText = buildShareText(result.tier, correct, result.bestStreak);
  const tierCounts = countTiers(result.tierHistory);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="results">
      <div className="results-hero">
        <p className="results-tag">Final Rank</p>
        <TierBadge tier={result.tier} size="xl" label={TIER_LABELS[result.tier]} pulse />
        <p className="results-headline">{result.headline}</p>
      </div>

      <div className="results-factors card">
        <h3 className="breakdown-title">What Shaped Your Rank</h3>
        <div className="factor-row">
          <span className="factor-label">Correct answers</span>
          <span className="factor-value">{breakdown.correct} / {breakdown.total}</span>
        </div>
        <div className="factor-row">
          <span className="factor-label">Accuracy</span>
          <span className="factor-value">{breakdown.accuracyPct}%</span>
        </div>
        <div className="factor-row">
          <span className="factor-label">Speed grade</span>
          <TierBadge tier={breakdown.speedTier} size="sm" />
        </div>
      </div>

      <div className="results-breakdown card">
        <h3 className="breakdown-title">Answer Grades</h3>
        <div className="breakdown-tiers">
          {[...TIER_ORDER].reverse().map((t) => {
            const count = tierCounts[t] ?? 0;
            if (count === 0) return null;
            return (
              <div key={t} className="breakdown-row">
                <TierBadge tier={t} size="sm" />
                <span className="breakdown-count">{count}×</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="results-stats card">
        <div className="result-stat">
          <span className="result-stat-value">{correct}</span>
          <span className="result-stat-label">Correct</span>
        </div>
        <div className="result-stat">
          <span className="result-stat-value">{result.bestStreak}</span>
          <span className="result-stat-label">Best Streak</span>
        </div>
        <div className="result-stat">
          <span className="result-stat-value">{breakdown.accuracyPct}%</span>
          <span className="result-stat-label">Accuracy</span>
        </div>
      </div>

      <div className="results-actions">
        <button className="btn btn-primary" onClick={onPlayAgain}>
          Run It Back
        </button>
        <button className="btn btn-secondary" onClick={handleShare}>
          {copied ? 'Copied!' : 'Share Rank'}
        </button>
        <button className="btn btn-ghost" onClick={onHome}>
          Main Menu
        </button>
      </div>
    </div>
  );
}
