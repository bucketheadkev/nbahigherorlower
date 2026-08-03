'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FranchiseData } from '@/lib/tradeup/franchise/types';
import { getSellValue, formatCredits } from '@/lib/tradeup/credits';
import { getPlayerById } from '@/lib/tradeup/rosters';
import { LINEUP_SIZE } from '@/lib/tradeup/franchise/types';
import { FranchisePlayerCard } from './FranchisePlayerCard';
import { FranchiseSlot } from './FranchiseSlot';
import { FranchiseSellModal } from './FranchiseSellModal';
import { FranchiseRosterModal, type RosterModalView } from './FranchiseRosterModal';

interface MyFranchisePanelProps {
  data: FranchiseData;
  collectionIds: string[];
  collectionSize: number;
  newPlayerId: string | null;
  onAssignStarting: (playerId: string, replacePlayerId?: string) => void;
  onAssignBench: (playerId: string, replacePlayerId?: string) => void;
  onMoveToCollection: (playerId: string) => void;
  onSwapPlayers: (playerA: string, playerB: string) => void;
  onSell: (playerId: string) => { name: string; amount: number } | null;
  onDrop: (playerId: string, zone: 'collection' | 'starting' | 'bench', slotIndex: number | null) => void;
  onToast: (message: string) => void;
}

export function MyFranchisePanel({
  data,
  collectionIds,
  collectionSize,
  newPlayerId,
  onAssignStarting,
  onAssignBench,
  onMoveToCollection,
  onSwapPlayers,
  onSell,
  onDrop,
  onToast,
}: MyFranchisePanelProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [sellTarget, setSellTarget] = useState<string | null>(null);
  const [sellProcessing, setSellProcessing] = useState(false);
  const sellLockRef = useRef(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{
    id: string;
    zone: 'collection' | 'starting' | 'bench';
  } | null>(null);
  const [modalView, setModalView] = useState<RosterModalView>('menu');
  const [collectionOpen, setCollectionOpen] = useState(false);

  useEffect(() => {
    if (newPlayerId) setCollectionOpen(true);
  }, [newPlayerId]);

  const closeModal = useCallback(() => {
    setSelectedPlayer(null);
    setModalView('menu');
  }, []);

  const handleDragStart = useCallback((playerId: string) => {
    setDraggingId(playerId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverTarget(null);
  }, []);

  const makeDropHandlers = useCallback(
    (zone: 'collection' | 'starting' | 'bench', slotIndex: number | null) => {
      const key = `${zone}-${slotIndex ?? 'pool'}`;
      return {
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDragOverTarget(key);
        },
        onDragLeave: () => setDragOverTarget((prev) => (prev === key ? null : prev)),
        onDrop: (e: React.DragEvent) => {
          e.preventDefault();
          const playerId = e.dataTransfer.getData('text/player-id');
          if (playerId) onDrop(playerId, zone, slotIndex);
          handleDragEnd();
        },
        isDragOver: dragOverTarget === key,
      };
    },
    [dragOverTarget, onDrop, handleDragEnd],
  );

  const openPlayer = useCallback((playerId: string, zone: 'collection' | 'starting' | 'bench') => {
    setSelectedPlayer({ id: playerId, zone });
    setModalView('menu');
  }, []);

  const renderCard = useCallback(
    (playerId: string, zone: 'collection' | 'starting' | 'bench') => (
      <FranchisePlayerCard
        key={playerId}
        playerId={playerId}
        zone={zone}
        isNew={playerId === newPlayerId}
        isDragging={draggingId === playerId}
        onSelect={() => openPlayer(playerId, zone)}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      />
    ),
    [newPlayerId, draggingId, openPlayer, handleDragStart, handleDragEnd],
  );

  const sellPlayer = sellTarget ? getPlayerById(sellTarget) : null;
  const sellValue = sellPlayer ? getSellValue(sellPlayer) : 0;
  const collectionDrop = makeDropHandlers('collection', null);

  const emptyCollectionMessage =
    collectionSize === 0
      ? {
          title: 'Your collection is empty.',
          desc: 'Add players to your collection while trading to build your franchise.',
        }
      : {
          title: 'No available players in your collection.',
          desc: 'Remove or swap a lineup player to place them back here.',
        };

  return (
    <div className="franchise-panel">
      <section className="franchise-lineup-section">
        <div className="franchise-section-head">
          <div>
            <h2 className="franchise-section-title">Starting Five</h2>
          </div>
        </div>
        <div className="franchise-lineup-row franchise-lineup-row--starters">
          {Array.from({ length: LINEUP_SIZE }).map((_, i) => {
            const drop = makeDropHandlers('starting', i);
            return (
              <FranchiseSlot
                key={`start-${i}`}
                label="Starter"
                playerId={data.startingFive[i]}
                zone="starting"
                slotIndex={i}
                draggingId={draggingId}
                isDragOver={drop.isDragOver}
                onDragOver={drop.onDragOver}
                onDragLeave={drop.onDragLeave}
                onDrop={drop.onDrop}
                renderCard={(id) => renderCard(id, 'starting')}
              />
            );
          })}
        </div>
      </section>

      <section className="franchise-lineup-section franchise-lineup-section--bench">
        <div className="franchise-section-head">
          <div>
            <h2 className="franchise-section-title">Bench</h2>
          </div>
        </div>
        <div className="franchise-lineup-row franchise-lineup-row--bench">
          {Array.from({ length: LINEUP_SIZE }).map((_, i) => {
            const drop = makeDropHandlers('bench', i);
            return (
              <FranchiseSlot
                key={`bench-${i}`}
                label="Bench"
                playerId={data.bench[i]}
                zone="bench"
                slotIndex={i}
                draggingId={draggingId}
                isDragOver={drop.isDragOver}
                onDragOver={drop.onDragOver}
                onDragLeave={drop.onDragLeave}
                onDrop={drop.onDrop}
                renderCard={(id) => renderCard(id, 'bench')}
              />
            );
          })}
        </div>
      </section>

      <section id="franchise-collection" className="franchise-collection-section">
        <button
          type="button"
          className="franchise-collection-toggle"
          aria-expanded={collectionOpen}
          onClick={() => setCollectionOpen((open) => !open)}
        >
          <span className="franchise-section-title">Collection</span>
          <span className="franchise-collection-toggle__meta">
            {collectionIds.length} available
            <span className="franchise-collection-toggle__chevron" aria-hidden>
              {collectionOpen ? '−' : '+'}
            </span>
          </span>
        </button>
        {collectionOpen ? (
          <div
            className={`franchise-collection${collectionDrop.isDragOver ? ' franchise-collection--drag-over' : ''}`}
            onDragOver={collectionDrop.onDragOver}
            onDragLeave={collectionDrop.onDragLeave}
            onDrop={collectionDrop.onDrop}
          >
            {collectionIds.length === 0 ? (
              <div className="franchise-collection-empty">
                <p className="franchise-collection-empty-title">{emptyCollectionMessage.title}</p>
                <p className="franchise-collection-empty-desc">{emptyCollectionMessage.desc}</p>
              </div>
            ) : (
              collectionIds.map((id) => renderCard(id, 'collection'))
            )}
          </div>
        ) : null}
      </section>

      {selectedPlayer ? (
        <FranchiseRosterModal
          playerId={selectedPlayer.id}
          zone={selectedPlayer.zone}
          data={data}
          view={modalView}
          onViewChange={setModalView}
          onClose={closeModal}
          onAssignStarting={(replaceId) => {
            onAssignStarting(selectedPlayer.id, replaceId);
            onToast(
              selectedPlayer.zone === 'collection'
                ? 'Player added to Starting Five'
                : 'Lineup updated',
            );
            closeModal();
          }}
          onAssignBench={(replaceId) => {
            onAssignBench(selectedPlayer.id, replaceId);
            onToast(
              selectedPlayer.zone === 'collection' ? 'Player added to Bench' : 'Lineup updated',
            );
            closeModal();
          }}
          onMoveToCollection={() => {
            onMoveToCollection(selectedPlayer.id);
            onToast('Player moved to My Collection');
            closeModal();
          }}
          onSwap={(targetId) => {
            onSwapPlayers(selectedPlayer.id, targetId);
            onToast('Lineup updated');
            closeModal();
          }}
          onSell={() => {
            if (selectedPlayer.zone !== 'collection') return;
            closeModal();
            setSellTarget(selectedPlayer.id);
          }}
        />
      ) : null}

      {sellPlayer ? (
        <FranchiseSellModal
          playerName={sellPlayer.name}
          credits={sellValue}
          processing={sellProcessing}
          onCancel={() => {
            if (sellProcessing) return;
            setSellTarget(null);
          }}
          onConfirm={() => {
            if (!sellTarget || sellLockRef.current || sellProcessing) return;
            sellLockRef.current = true;
            setSellProcessing(true);
            const result = onSell(sellTarget);
            sellLockRef.current = false;
            setSellProcessing(false);
            setSellTarget(null);
            if (result) {
              onToast(`${result.name} sold for ${formatCredits(result.amount)} Credits`);
            }
          }}
        />
      ) : null}
    </div>
  );
}
