'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import {
  formatDollars,
  generatePackChoices,
  type PackDefinition,
  type PackKind,
} from '@/lib/tradeup/billionDollar';
import { getPrefersReducedMotion } from '@/lib/tradeup/motionPreference';
import { TradeUpLogo } from './TradeUpLogo';

interface PackSelectScreenProps {
  onSelect: (pack: PackDefinition) => void;
  onExit: () => void;
}

const RARITY_LABEL: Record<PackDefinition['rarity'], string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

export function PackSelectScreen({ onSelect, onExit }: PackSelectScreenProps) {
  const reduceMotion = getPrefersReducedMotion();
  const choices = useMemo(() => generatePackChoices(), []);
  const [selectedKind, setSelectedKind] = useState<PackKind | null>(null);
  const [leaving, setLeaving] = useState(false);

  const handlePick = (pack: PackDefinition) => {
    if (selectedKind || leaving) return;
    setSelectedKind(pack.kind);
    window.setTimeout(
      () => {
        setLeaving(true);
        window.setTimeout(() => onSelect(pack), reduceMotion ? 80 : 420);
      },
      reduceMotion ? 60 : 520,
    );
  };

  return (
    <div className={`pack-select${leaving ? ' is-leaving' : ''}`}>
      <button type="button" className="pack-select__home" onClick={onExit}>
        ← Home
      </button>

      <motion.header
        className="pack-select__header"
        initial={reduceMotion ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: leaving ? 0 : 1, y: leaving ? -8 : 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <TradeUpLogo size="sm" priority />
        <h1>Choose Your Pack</h1>
        <p>Four sealed deals. One roster. Open the one that fits your run.</p>
      </motion.header>

      <div className="pack-select__grid" role="list">
        {choices.map((pack, index) => {
          const isSelected = selectedKind === pack.kind;
          const isDimmed = selectedKind !== null && !isSelected;
          return (
            <motion.button
              key={pack.kind}
              type="button"
              role="listitem"
              className={`pack-select__card pack-select__card--${pack.kind}${
                isSelected ? ' is-selected' : ''
              }${isDimmed ? ' is-dimmed' : ''}`}
              disabled={selectedKind !== null}
              onClick={() => handlePick(pack)}
              initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.94 }}
              animate={
                leaving && isSelected
                  ? { opacity: 1, scale: 1.06, y: -6 }
                  : leaving
                    ? { opacity: 0, scale: 0.92, y: 12 }
                    : { opacity: isDimmed ? 0.28 : 1, y: 0, scale: isSelected ? 1.04 : 1 }
              }
              transition={{
                delay: reduceMotion ? 0 : 0.08 + index * 0.07,
                duration: 0.45,
                ease: [0.22, 1, 0.36, 1],
              }}
              whileHover={
                reduceMotion || selectedKind
                  ? undefined
                  : { y: -6, scale: 1.03, transition: { type: 'spring', stiffness: 380, damping: 22 } }
              }
              whileTap={
                reduceMotion || selectedKind
                  ? undefined
                  : { scale: 0.97, transition: { duration: 0.1 } }
              }
            >
              <span className="pack-select__card-glow" aria-hidden />
              <span className="pack-select__card-foil" aria-hidden />
              <span className="pack-select__rarity">{RARITY_LABEL[pack.rarity]}</span>
              <div className="pack-select__stack" aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <strong className="pack-select__title">{pack.title}</strong>
              <span className="pack-select__sub">{pack.subtitle}</span>
              <span className="pack-select__value">{formatDollars(pack.estimatedValue)}</span>
              <span className="pack-select__cta">Select</span>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {selectedKind ? (
          <motion.p
            className="pack-select__confirm"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            Sealing deal…
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
