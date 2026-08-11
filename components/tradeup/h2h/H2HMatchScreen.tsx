'use client';

import dynamic from 'next/dynamic';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useMatchSync } from '@/hooks/useMatchSync';
import { clearActiveRoom } from '@/lib/multiplayer/activeRoom';
import {
  deriveMatchOutcome,
  type MatchLineupEntry,
  type MatchResultRow,
} from '@/lib/multiplayer/match';
import { leaveRoom } from '@/lib/multiplayer/rooms';
import { formatDollarsExact } from '@/lib/tradeup/billionDollar';
import { getH2HUsername } from '@/lib/tradeup/h2hUsername';
import { hapticLight } from '@/lib/tradeup/haptics';
import { TradeUpLoading } from '../TradeUpLoading';

const BillionTradeEngine = dynamic(
  () =>
    import('../BillionTradeEngine').then((mod) => ({
      default: mod.BillionTradeEngine,
    })),
  { loading: () => <TradeUpLoading /> },
);

interface H2HMatchScreenProps {
  roomId: string;
  userId: string;
  onLeft: () => void;
}

type MatchUi = 'playing' | 'waiting' | 'results';

export function H2HMatchScreen({ roomId, userId, onLeft }: H2HMatchScreenProps) {
  const {
    snapshot,
    results,
    error,
    opponentProgress,
    opponentName,
    myResult,
    bothSubmitted,
    pushProgress,
    submitResult,
    submitBusy,
  } = useMatchSync({ roomId, userId });

  const [ui, setUi] = useState<MatchUi>('playing');
  const [localError, setLocalError] = useState<string | null>(null);
  const completeLock = useRef(false);

  useEffect(() => {
    if (myResult && !bothSubmitted) setUi('waiting');
    if (bothSubmitted) setUi('results');
  }, [bothSubmitted, myResult]);

  // Restore: already submitted before mount
  useEffect(() => {
    if (myResult) {
      completeLock.current = true;
      setUi(bothSubmitted ? 'results' : 'waiting');
    }
  }, [bothSubmitted, myResult]);

  const myName =
    snapshot?.players.find((p) => p.user_id === userId)?.display_name ??
    getH2HUsername() ??
    'You';

  const handleProgress = useCallback(
    (count: number) => {
      void pushProgress(count);
    },
    [pushProgress],
  );

  const handleComplete = useCallback(
    async (payload: { lineup: MatchLineupEntry[]; totalValue: number }) => {
      if (completeLock.current || submitBusy) return;
      completeLock.current = true;
      setLocalError(null);
      try {
        await pushProgress(5);
        await submitResult(payload.lineup, payload.totalValue);
        setUi('waiting');
      } catch (err) {
        completeLock.current = false;
        setLocalError(err instanceof Error ? err.message : 'Submit failed.');
      }
    },
    [pushProgress, submitBusy, submitResult],
  );

  const handleLeave = useCallback(async () => {
    try {
      await leaveRoom(roomId);
    } catch {
      /* still exit */
    } finally {
      clearActiveRoom();
      onLeft();
    }
  }, [onLeft, roomId]);

  if (ui === 'results' && results.length >= 2) {
    return (
      <H2HMatchResults
        userId={userId}
        myName={myName}
        opponentName={opponentName}
        results={results}
        onLeft={() => void handleLeave()}
      />
    );
  }

  if (ui === 'waiting') {
    const myProg = myResult ? 5 : snapshot?.players.find((p) => p.user_id === userId)?.match_progress ?? 5;
    return (
      <div className="h2h-lobby h2h-lobby--match-wait" aria-label="Waiting for opponent">
        <header className="h2h-lobby__header">
          <p className="h2h-lobby__eyebrow">1V1 MATCH</p>
          <h1 className="h2h-lobby__title">Waiting for opponent…</h1>
          <p className="h2h-lobby__subtitle">Both runs sync when they finish.</p>
        </header>
        <div className="h2h-lobby__slots">
          <div className="h2h-lobby__slot is-filled">
            <div className="h2h-lobby__slot-top">
              <span className="h2h-lobby__slot-label">You</span>
            </div>
            <p className="h2h-lobby__slot-name">{myName}</p>
            <p className="h2h-lobby__slot-ready is-on">{myProg}/5</p>
          </div>
          <div className="h2h-lobby__slot is-filled">
            <div className="h2h-lobby__slot-top">
              <span className="h2h-lobby__slot-label">Opponent</span>
            </div>
            <p className="h2h-lobby__slot-name">{opponentName}</p>
            <p className={`h2h-lobby__slot-ready${opponentProgress >= 5 ? ' is-on' : ''}`}>
              {opponentProgress}/5
            </p>
          </div>
        </div>
        {(localError || error) ? (
          <p className="h2h-lobby__error" role="alert">
            {localError || error}
          </p>
        ) : null}
        <button
          type="button"
          className="h2h-lobby__leave"
          onPointerDown={(e: ReactPointerEvent) => {
            e.preventDefault();
            hapticLight();
            void handleLeave();
          }}
        >
          Leave Match
        </button>
      </div>
    );
  }

  return (
    <>
      {(localError || error) && ui === 'playing' ? (
        <p className="h2h-match-banner-error" role="alert">
          {localError || error}
        </p>
      ) : null}
      <BillionTradeEngine
        challengeMode="online"
        h2hPlayerName={myName}
        onlineOpponentName={opponentName}
        onlineOpponentProgress={opponentProgress}
        onOnlineProgress={handleProgress}
        onOnlineComplete={(payload) => {
          void handleComplete(payload);
        }}
        onExit={() => void handleLeave()}
      />
    </>
  );
}

function H2HMatchResults({
  userId,
  myName,
  opponentName,
  results,
  onLeft,
}: {
  userId: string;
  myName: string;
  opponentName: string;
  results: MatchResultRow[];
  onLeft: () => void;
}) {
  const derived = deriveMatchOutcome(userId, results);
  const mine = results.find((r) => r.user_id === userId)!;
  const theirs = results.find((r) => r.user_id !== userId)!;
  const headline =
    derived?.outcome === 'win'
      ? 'YOU WIN'
      : derived?.outcome === 'loss'
        ? 'YOU LOSE'
        : 'TIE';

  return (
    <div className="h2h-lobby h2h-lobby--results" aria-label="Match results">
      <header className="h2h-lobby__header">
        <p className="h2h-lobby__eyebrow">1V1 RESULTS</p>
        <h1 className="h2h-lobby__title">{headline}</h1>
        <p className="h2h-lobby__subtitle">Higher total wins. Winner is from stored totals only.</p>
      </header>

      <div className="h2h-results__grid">
        <ResultCard
          name={myName}
          label="You"
          total={mine.total_value}
          lineup={mine.lineup}
          highlight={derived?.outcome === 'win'}
        />
        <ResultCard
          name={opponentName}
          label="Opponent"
          total={theirs.total_value}
          lineup={theirs.lineup}
          highlight={derived?.outcome === 'loss'}
        />
      </div>

      <button
        type="button"
        className="run-btn run-btn--primary h2h-lobby__submit"
        onPointerDown={(e: ReactPointerEvent) => {
          e.preventDefault();
          hapticLight();
          onLeft();
        }}
      >
        <strong>BACK TO 1V1</strong>
      </button>
    </div>
  );
}

function ResultCard({
  name,
  label,
  total,
  lineup,
  highlight,
}: {
  name: string;
  label: string;
  total: number;
  lineup: MatchLineupEntry[];
  highlight: boolean;
}) {
  return (
    <div className={`h2h-results__card${highlight ? ' is-winner' : ''}`}>
      <div className="h2h-results__card-top">
        <span>{label}</span>
        <strong>{name}</strong>
      </div>
      <p className="h2h-results__total">{formatDollarsExact(total)}</p>
      <ul className="h2h-results__lineup">
        {lineup.map((p) => (
          <li key={`${p.position}-${p.name}`}>
            <em>{p.position}</em>
            <span>{p.name}</span>
            <b>{formatDollarsExact(p.dollarValue)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
