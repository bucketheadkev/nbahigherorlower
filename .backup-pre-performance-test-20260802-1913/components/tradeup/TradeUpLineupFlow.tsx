'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LINEUP_POSITIONS } from '@/lib/tradeup/startingLineup';
import {
  deriveSeasonStanding,
  type SeasonStanding,
} from '@/lib/tradeup/seasonStanding';
import type { PlayInSeed } from '@/lib/tradeup/playIn';
import { getUserTeam, type UserTeamIdentity } from '@/lib/tradeup/userTeam';
import { useLineupSession } from '@/hooks/useLineupSession';
import { LineupRevealScreen } from './LineupRevealScreen';
import { LineupSeasonScreen } from './LineupSeasonScreen';
import { PlayInScreen } from './PlayInScreen';
import { PlayoffRunScreen } from './PlayoffRunScreen';
import { TradeUpLoading } from './TradeUpLoading';

type RunScreen = 'lineup' | 'season' | 'play-in' | 'playoffs';

interface TradeUpLineupFlowProps {
  screen: RunScreen;
  onScreenChange: (screen: RunScreen) => void;
  onExit: () => void;
  onMatchComplete?: () => void;
}

export function TradeUpLineupFlow({
  screen,
  onScreenChange,
  onExit,
  onMatchComplete,
}: TradeUpLineupFlowProps) {
  const lineup = useLineupSession();
  const startedRef = useRef(false);
  const [userTeam, setUserTeam] = useState<UserTeamIdentity | null>(() => getUserTeam());

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    lineup.newLineup();
  }, [lineup.newLineup]);

  const finalizedLineup = useMemo(
    () =>
      lineup.slots.flatMap(({ slot, state, player }) =>
        state.finalized && player ? [{ slot, player }] : [],
      ),
    [lineup.slots],
  );

  const standing: SeasonStanding | null = useMemo(() => {
    if (!lineup.seasonRecord) return null;
    return deriveSeasonStanding(lineup.seasonRecord.wins, lineup.seasonRecord.losses);
  }, [lineup.seasonRecord]);

  const startFreshRun = useCallback(() => {
    onMatchComplete?.();
    lineup.newLineup();
    onScreenChange('lineup');
  }, [lineup.newLineup, onMatchComplete, onScreenChange]);

  const handleExit = useCallback(() => {
    onMatchComplete?.();
    onExit();
  }, [onExit, onMatchComplete]);

  const goToSeason = useCallback(
    (team: UserTeamIdentity) => {
      setUserTeam(team);
      onScreenChange('season');
    },
    [onScreenChange],
  );

  const handleCompleteSeason = useCallback(() => {
    lineup.completeSeasonSimulation();
    return false;
  }, [lineup.completeSeasonSimulation]);

  if (!lineup.session) {
    return <TradeUpLoading />;
  }

  if (screen === 'playoffs') {
    if (finalizedLineup.length !== LINEUP_POSITIONS.length || !lineup.seasonRecord) {
      return <TradeUpLoading />;
    }
    return (
      <PlayoffRunScreen
        players={finalizedLineup}
        record={lineup.seasonRecord}
        userTeam={userTeam}
        onExit={handleExit}
        onPlayAgain={startFreshRun}
        onChampionshipWon={onMatchComplete}
      />
    );
  }

  if (screen === 'play-in') {
    if (
      finalizedLineup.length !== LINEUP_POSITIONS.length ||
      !lineup.seasonRecord ||
      !standing?.seed ||
      standing.seed < 7 ||
      standing.seed > 10
    ) {
      return <TradeUpLoading />;
    }
    return (
      <PlayInScreen
        seed={standing.seed as PlayInSeed}
        lineupScore={lineup.seasonRecord.analysis.lineupScore}
        seasonWins={lineup.seasonRecord.wins}
        seasonLosses={lineup.seasonRecord.losses}
        userTeam={userTeam}
        onClinched={() => onScreenChange('playoffs')}
        onEliminatedHome={handleExit}
        onPlayAgain={startFreshRun}
      />
    );
  }

  if (screen === 'season') {
    if (finalizedLineup.length !== LINEUP_POSITIONS.length) {
      return <TradeUpLoading />;
    }
    return (
      <LineupSeasonScreen
        players={finalizedLineup}
        record={lineup.seasonRecord}
        userTeam={userTeam}
        simulationComplete={Boolean(lineup.session.seasonSimulationComplete)}
        onBeginSimulation={lineup.beginSeasonSimulation}
        onCompleteSimulation={handleCompleteSeason}
        onStartNewRun={startFreshRun}
        onProceedToPlayoffs={
          standing?.berth === 'playoffs' ? () => onScreenChange('playoffs') : undefined
        }
        onEnterPlayIn={
          standing?.berth === 'play_in' ? () => onScreenChange('play-in') : undefined
        }
        onExit={handleExit}
      />
    );
  }

  return (
    <LineupRevealScreen
      session={lineup}
      onExit={onExit}
      onLineupComplete={goToSeason}
    />
  );
}
