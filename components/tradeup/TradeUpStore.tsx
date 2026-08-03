'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { StartingTier, TradePlayer } from '@/lib/tradeup/types';
import { STARTING_TIER_OFFERS, formatCredits } from '@/lib/tradeup/credits';
import {
  getAvailableSTierSpinPlayers,
  performSTierSpinPurchase,
  S_TIER_SPIN_COST,
} from '@/lib/tradeup/sTierSpin';
import { CreditsBadge } from './CreditsBadge';
import { TierBadge } from './TierBadge';
import type { PlayerTier } from '@/lib/tradeup/tiers';
import { HomeBackground } from './home/HomeBackground';
import { STierSpinCard } from './store/STierSpinCard';
import { STierSpinConfirmModal } from './store/STierSpinConfirmModal';
import { STierSpinWheelModal } from './store/STierSpinWheelModal';
import { useSound } from '@/hooks/useSound';

interface TradeUpStoreProps {
  credits: number;
  startingTier: StartingTier;
  ownedStartingTiers: StartingTier[];
  collectionIds: string[];
  onBack: () => void;
  onPurchase: (tier: StartingTier) => boolean;
  onEquip: (tier: StartingTier) => boolean;
  spendCredits: (amount: number) => { success: boolean; balance: number };
  getCredits: () => number;
  onAwardCollectionPlayer: (player: TradePlayer) => void;
  onViewFranchise: () => void;
}

const TIER_MAP: Record<StartingTier, PlayerTier> = {
  F: 'F',
  D: 'D',
  C: 'C',
  B: 'B',
};

type CardState = 'available' | 'locked' | 'owned' | 'equipped';

function getCardState(
  item: (typeof STARTING_TIER_OFFERS)[number],
  owned: boolean,
  equipped: boolean,
  canAfford: boolean,
): CardState {
  if (equipped) return 'equipped';
  if (owned || item.included) return 'owned';
  return canAfford ? 'available' : 'locked';
}

interface StoreTierCardProps {
  item: (typeof STARTING_TIER_OFFERS)[number];
  owned: boolean;
  equipped: boolean;
  canAfford: boolean;
  index: number;
  onPurchase: () => void;
  onEquip: () => void;
}

function StoreTierCard({
  item,
  owned,
  equipped,
  canAfford,
  index,
  onPurchase,
  onEquip,
}: StoreTierCardProps) {
  const state = getCardState(item, owned, equipped, canAfford);

  return (
    <motion.article
      className={`store-card store-card--${state}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: index * 0.04 }}
    >
      <div className="store-card__top">
        <TierBadge tier={TIER_MAP[item.tier]} size="large" />
        {state === 'equipped' ? (
          <span className="store-card__badge store-card__badge--equipped">Equipped</span>
        ) : state === 'owned' || item.included ? (
          <span className="store-card__badge store-card__badge--owned">Owned</span>
        ) : state === 'locked' ? (
          <span className="store-card__badge store-card__badge--locked">Locked</span>
        ) : (
          <span className="store-card__badge store-card__badge--available">Available</span>
        )}
      </div>

      <h3 className="store-card__name">{item.name}</h3>
      <p className="store-card__desc">{item.description}</p>

      <div className="store-card__footer">
        <span className="store-card__price">
          {item.included ? 'Included' : `${formatCredits(item.cost)} credits`}
        </span>

        {state === 'equipped' ? (
          <span className="tu-btn tu-btn--ghost store-card__status">Equipped</span>
        ) : owned && !equipped ? (
          <button type="button" className="tu-btn tu-btn--secondary" onClick={onEquip}>
            Equip
          </button>
        ) : item.included && !equipped ? (
          <button type="button" className="tu-btn tu-btn--secondary" onClick={onEquip}>
            Equip
          </button>
        ) : !owned && !item.included ? (
          <button
            type="button"
            className="tu-btn tu-btn--primary"
            disabled={!canAfford}
            onClick={onPurchase}
          >
            {canAfford ? `Buy · ${formatCredits(item.cost)}` : 'Not Enough Credits'}
          </button>
        ) : null}
      </div>
    </motion.article>
  );
}

export function TradeUpStore({
  credits,
  startingTier,
  ownedStartingTiers,
  collectionIds,
  onBack,
  onPurchase,
  onEquip,
  spendCredits,
  getCredits,
  onAwardCollectionPlayer,
  onViewFranchise,
}: TradeUpStoreProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [confirmSpinOpen, setConfirmSpinOpen] = useState(false);
  const [wheelSession, setWheelSession] = useState<{
    player: TradePlayer;
    winnerIndex: number;
  } | null>(null);
  const spinningRef = useRef(false);
  const { playAddCollection, playUnlock } = useSound();

  const allSTierOwned = getAvailableSTierSpinPlayers(collectionIds).length === 0;

  const handleBuy = (tier: StartingTier, label: string) => {
    const success = onPurchase(tier);
    if (success) {
      setMessage(`${label.replace(' Player', ' Starting Player')} unlocked`);
    } else if (ownedStartingTiers.includes(tier)) {
      setMessage('You already own this upgrade.');
    } else {
      setMessage('Not enough credits.');
    }
  };

  const handleEquip = (tier: StartingTier) => {
    const success = onEquip(tier);
    if (success) {
      setMessage(`${tier}-tier starting player equipped for new runs.`);
    } else {
      setMessage('Purchase this upgrade before equipping.');
    }
  };

  const handleSpinRequest = () => {
    if (spinningRef.current || allSTierOwned) return;
    if (credits < S_TIER_SPIN_COST) return;
    setConfirmSpinOpen(true);
  };

  const handleConfirmSpin = () => {
    if (spinningRef.current) return;
    spinningRef.current = true;

    const purchase = performSTierSpinPurchase(collectionIds, getCredits, spendCredits);
    if (purchase.ok === false) {
      spinningRef.current = false;
      setConfirmSpinOpen(false);
      if (purchase.reason === 'all_owned') {
        setMessage('You already own every S-tier player.');
      } else {
        setMessage('Not enough credits.');
      }
      return;
    }

    onAwardCollectionPlayer(purchase.player);
    setConfirmSpinOpen(false);
    setWheelSession({ player: purchase.player, winnerIndex: purchase.winnerIndex });
    setMessage(null);
  };

  const handleWheelLand = () => {
    playUnlock();
    playAddCollection();
  };

  const handleWheelComplete = () => {
    spinningRef.current = false;
  };

  const handleWheelClose = () => {
    setWheelSession(null);
  };

  const handleViewCollection = () => {
    setWheelSession(null);
    onViewFranchise();
  };

  return (
    <div className="tradeup-shell tradeup-shell--store">
      <HomeBackground />
      <header className="tradeup-header store-page-header">
        <button type="button" className="tu-back" onClick={onBack}>
          ← Home
        </button>
        <CreditsBadge credits={credits} size="large" />
      </header>

      <main className="store-main store-page">
        <div className="store-intro">
          <h1 className="store-title">Store</h1>
        </div>

        <section className="store-section" aria-labelledby="store-tier-heading">
          <h2 id="store-tier-heading" className="store-section__title">
            Starting Tier
          </h2>
          <div className="store-grid store-grid--tiers">
            {STARTING_TIER_OFFERS.map((item, index) => {
              const owned = ownedStartingTiers.includes(item.tier);
              const equipped = startingTier === item.tier;
              const canAfford = credits >= item.cost;

              return (
                <StoreTierCard
                  key={item.id}
                  item={item}
                  owned={owned}
                  equipped={equipped}
                  canAfford={canAfford}
                  index={index}
                  onPurchase={() => handleBuy(item.tier, item.name)}
                  onEquip={() => handleEquip(item.tier)}
                />
              );
            })}
          </div>
        </section>

        <section className="store-section" aria-labelledby="store-franchise-heading">
          <h2 id="store-franchise-heading" className="store-section__title">
            Collection
          </h2>
          <STierSpinCard
            credits={credits}
            allOwned={allSTierOwned}
            onSpin={handleSpinRequest}
          />
        </section>

        {message ? <p className="store-message" role="status">{message}</p> : null}
      </main>

      {confirmSpinOpen ? (
        <STierSpinConfirmModal
          credits={credits}
          onConfirm={handleConfirmSpin}
          onCancel={() => setConfirmSpinOpen(false)}
        />
      ) : null}

      {wheelSession ? (
        <STierSpinWheelModal
          winner={wheelSession.player}
          winnerIndex={wheelSession.winnerIndex}
          onComplete={handleWheelComplete}
          onViewCollection={handleViewCollection}
          onClose={handleWheelClose}
          onLand={handleWheelLand}
        />
      ) : null}
    </div>
  );
}
