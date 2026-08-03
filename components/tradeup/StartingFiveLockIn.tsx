'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Position, TradePlayer } from '@/lib/tradeup/types';
import {
  franchiseNameCandidates,
  generateFranchiseIdentity,
} from '@/lib/tradeup/franchiseNames';
import {
  formatUserTeamLabel,
  getUserTeam,
  saveUserTeam,
  type UserConference,
  type UserTeamIdentity,
} from '@/lib/tradeup/userTeam';
import { useSound } from '@/hooks/useSound';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { PlayerCardVisual } from './PlayerCardVisual';

interface StartingFiveLockInProps {
  players: Array<{ slot: Position; player: TradePlayer }>;
  onGo: (team: UserTeamIdentity) => void;
}

type GenPhase = 'spinning' | 'ready';

export function StartingFiveLockIn({ players, onGo }: StartingFiveLockInProps) {
  const goLockRef = useRef(false);
  const spunRef = useRef(false);
  const { resume, playTap, play } = useSound();
  const existing = typeof window !== 'undefined' ? getUserTeam() : null;
  const [conference, setConference] = useState<UserConference>(existing?.conference ?? 'East');
  const [team, setTeam] = useState<UserTeamIdentity | null>(existing);
  const [displayLabel, setDisplayLabel] = useState(
    existing ? formatUserTeamLabel(existing) : 'Generating…',
  );
  const [phase, setPhase] = useState<GenPhase>(existing ? 'ready' : 'spinning');
  const [error, setError] = useState('');

  const runGeneration = useCallback(
    (conf: UserConference) => {
      const reduceMotion = getPrefersReducedMotion();
      if (reduceMotion) {
        const next = generateFranchiseIdentity(conf);
        setTeam(next);
        setDisplayLabel(formatUserTeamLabel(next));
        setPhase('ready');
        return;
      }

      const candidates = franchiseNameCandidates(16);
      let index = 0;
      setPhase('spinning');
      setDisplayLabel(formatUserTeamLabel(candidates[0]!));

      const spin = window.setInterval(() => {
        index += 1;
        setDisplayLabel(formatUserTeamLabel(candidates[index % candidates.length]!));
        if (index > 10) {
          window.clearInterval(spin);
          const final = generateFranchiseIdentity(conf);
          setTeam(final);
          setDisplayLabel(formatUserTeamLabel(final));
          setPhase('ready');
          play('unlock');
        }
      }, 90);

      return () => window.clearInterval(spin);
    },
    [play],
  );

  useEffect(() => {
    if (spunRef.current) return;
    spunRef.current = true;
    const stored = getUserTeam();
    if (stored) {
      setTeam(stored);
      setConference(stored.conference);
      setDisplayLabel(formatUserTeamLabel(stored));
      setPhase('ready');
      return;
    }
    return runGeneration(conference);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generate once on mount
  }, []);

  const handleGo = useCallback(() => {
    if (goLockRef.current || phase !== 'ready' || !team) return;
    const saved = saveUserTeam({
      city: team.city,
      name: team.name,
      conference,
    });
    if (!saved) {
      setError('Could not lock franchise name. Try regenerating.');
      return;
    }
    goLockRef.current = true;
    resume();
    playTap();
    play('match_go');
    onGo({ ...saved, conference });
  }, [conference, onGo, phase, play, playTap, resume, team]);

  return (
    <div className="starting-five-lock" role="dialog" aria-modal="true" aria-labelledby="starting-five-title">
      <div className="starting-five-lock__lights" aria-hidden />
      <div className="starting-five-lock__content">
        <p className="starting-five-lock__eyebrow">Lineup Locked</p>
        <h2 id="starting-five-title" className="starting-five-lock__title">
          YOUR STARTING FIVE
        </h2>
        <p className="starting-five-lock__sub">
          {phase === 'spinning' ? 'Generating your franchise…' : 'Franchise ready — press Go.'}
        </p>

        <div className="starting-five-lock__cards" aria-label="Your starting five">
          {players.map(({ slot, player }, index) => (
            <div
              key={slot}
              className={`starting-five-lock__card starting-five-lock__card--${slot.toLowerCase()}`}
              style={{ '--lock-index': index } as CSSProperties}
            >
              <PlayerCardVisual player={player} slot={slot} variant="full" size="md" />
            </div>
          ))}
        </div>

        <div className="team-name-form team-name-form--generated">
          <div
            className={`team-name-gen${phase === 'spinning' ? ' is-spinning' : ' is-ready'}`}
            aria-live="polite"
          >
            <span className="team-name-gen__label">
              {phase === 'spinning' ? 'Naming franchise' : 'Your franchise'}
            </span>
            <strong className="team-name-gen__value">{displayLabel}</strong>
            <span className="team-name-gen__conf">{conference}ern Conference</span>
          </div>

          <div className="team-name-form__conference" role="group" aria-label="Conference">
            <div className="team-name-form__conference-toggle">
              <button
                type="button"
                className={`team-conf-btn${conference === 'East' ? ' is-active' : ''}`}
                disabled={phase === 'spinning'}
                onClick={() => {
                  setConference('East');
                  if (team) setTeam({ ...team, conference: 'East' });
                }}
              >
                East
              </button>
              <button
                type="button"
                className={`team-conf-btn${conference === 'West' ? ' is-active' : ''}`}
                disabled={phase === 'spinning'}
                onClick={() => {
                  setConference('West');
                  if (team) setTeam({ ...team, conference: 'West' });
                }}
              >
                West
              </button>
            </div>
          </div>

          {error ? (
            <p className="team-name-form__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="team-name-form__actions">
            <button
              type="button"
              className="tu-btn tu-btn--secondary"
              onClick={() => runGeneration(conference)}
              disabled={phase === 'spinning'}
            >
              Regenerate
            </button>
            <button
              type="button"
              className="tu-btn tu-btn--primary starting-five-lock__go"
              onClick={handleGo}
              disabled={phase !== 'ready'}
            >
              GO
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
