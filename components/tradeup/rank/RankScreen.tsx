"use client";

import type { CSSProperties } from "react";
import { useAccountAuth } from "@/hooks/useAccountAuth";
import { useBankBalance } from "@/hooks/useBankBalance";
import { useLocale } from "@/hooks/useLocale";
import { useRank } from "@/hooks/useRank";
import { formatCash } from "@/lib/tradeup/bank";
import { nextRank, RANKS, rankName } from "@/lib/tradeup/rank/config";
import { ArenaAtmosphere } from "../ArenaAtmosphere";
import { RankEmblem } from "./RankEmblem";

type Copy = { en: string; es: string };

const COPY = {
  eyebrow: { en: "MY RANK", es: "MI RANGO" },
  best: { en: "Best Bank", es: "Mejor Banco" },
  next: { en: "Next", es: "Siguiente" },
  toGo: { en: "{amount} to go", es: "Faltan {amount}" },
  top: {
    en: "The highest rank in 1B Run.",
    es: "El rango más alto de 1B Run.",
  },
  you: { en: "YOU", es: "TÚ" },
  note: {
    en: "Your rank is set by the most money you’ve ever had in your Bank. Spending never lowers it.",
    es: "Tu rango depende de lo máximo que has tenido en tu Banco. Gastar nunca lo baja.",
  },
} satisfies Record<string, Copy>;

function pick(copy: Copy, locale: string): string {
  return locale === "es" ? copy.es : copy.en;
}

export function RankScreen() {
  const { locale } = useLocale();
  const { state: account } = useAccountAuth();
  const permanent = account.status === "permanent";
  const balance = useBankBalance(permanent);
  const { rank, peak, ready } = useRank(
    account.status === "permanent" ? account.user.id : null,
    balance,
  );
  const next = nextRank(rank);
  const progress = next
    ? Math.min(
        1,
        Math.max(0, (peak - rank.minBank) / (next.minBank - rank.minBank)),
      )
    : 1;

  return (
    <div
      className="tradeup-shell tradeup-shell--home tradeup-shell--hub oneb-hub rank2"
      style={
        {
          "--rank-color": rank.color,
          "--rank-deep": rank.deep,
        } as CSSProperties
      }
    >
      <ArenaAtmosphere intensity="hub" />
      <header className="oneb-hub__header">
        <p className="oneb-hub__eyebrow">{pick(COPY.eyebrow, locale)}</p>
      </header>

      <main className="oneb-hub__scroll rank2-main">
        {ready ? (
          <>
            <section
              className={`rank2-hero rank2-hero--${rank.id}`}
              aria-live="polite"
            >
              <span className="rank2-hero__halo" aria-hidden />
              <RankEmblem
                rank={rank}
                size={168}
                className="rank2-hero__emblem"
              />
              <h1 className="rank2-hero__name">{rankName(rank, locale)}</h1>
              <p className="rank2-hero__best">
                {pick(COPY.best, locale)} <strong>{formatCash(peak)}</strong>
              </p>
            </section>

            {next ? (
              <section
                className="rank2-next"
                style={{ "--next-color": next.color } as CSSProperties}
              >
                <div className="rank2-next__row">
                  <span className="rank2-next__label">
                    {pick(COPY.next, locale)}
                    <RankEmblem rank={next} size={22} />
                    <b>{rankName(next, locale)}</b>
                  </span>
                  <span className="rank2-next__togo">
                    {pick(COPY.toGo, locale).replace(
                      "{amount}",
                      formatCash(next.minBank - peak),
                    )}
                  </span>
                </div>
                <div
                  className="rank2-next__bar"
                  role="progressbar"
                  aria-valuenow={Math.round(progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={rankName(next, locale)}
                >
                  <i
                    style={{ transform: `scaleX(${Math.max(progress, 0.02)})` }}
                  />
                </div>
                <div className="rank2-next__ends">
                  <span>{formatCash(rank.minBank)}</span>
                  <span>{formatCash(next.minBank)}</span>
                </div>
              </section>
            ) : (
              <p className="rank2-top">{pick(COPY.top, locale)}</p>
            )}

            <ol className="rank2-ladder">
              {[...RANKS].reverse().map((def) => {
                const reached = def.level <= rank.level;
                const current = def.id === rank.id;
                return (
                  <li
                    key={def.id}
                    className={`rank2-step${reached ? " is-reached" : ""}${current ? " is-current" : ""}`}
                    style={
                      {
                        "--step-color": def.color,
                        "--step-deep": def.deep,
                      } as CSSProperties
                    }
                  >
                    <RankEmblem rank={def} size={46} />
                    <span className="rank2-step__name">
                      {rankName(def, locale)}
                    </span>
                    <span className="rank2-step__min">
                      {def.minBank === 0
                        ? "$0+"
                        : `${formatCash(def.minBank)}+`}
                    </span>
                    {current ? (
                      <em className="rank2-step__you">
                        {pick(COPY.you, locale)}
                      </em>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            <p className="rank2-note">{pick(COPY.note, locale)}</p>
          </>
        ) : null}
      </main>
    </div>
  );
}
