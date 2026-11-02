/**
 * Compact numbers for every Franchises screen. Display only — stored values stay exact.
 *
 *   Fans:  457,400,000 → 457.4M · 175,000,000 → 175M · 7,060,000 → 7.06M · 950,000 → 950K · 1,250,000,000 → 1.25B
 *   Cash:  $5,532,000 → $5.53M · $596,515,963 → $596.52M · $958,000 → $958K · $200,000,000 → $200M
 */

const UNITS = [
  { value: 1e9, suffix: 'B' },
  { value: 1e6, suffix: 'M' },
  { value: 1e3, suffix: 'K' },
] as const;

function trim(n: number, decimals: number): string {
  const text = n.toFixed(decimals);
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/** `decimalsFor(scaled, suffix)` picks the precision for a value already divided into its unit. */
function compact(abs: number, decimalsFor: (scaled: number, suffix: string) => number): string {
  for (let i = 0; i < UNITS.length; i++) {
    const unit = UNITS[i]!;
    if (abs < unit.value) continue;
    const scaled = abs / unit.value;
    const text = trim(scaled, decimalsFor(scaled, unit.suffix));
    // 999,999 must read 1M, not 1000K.
    if (Number(text) >= 1000 && i > 0) {
      const up = UNITS[i - 1]!;
      return `${trim(abs / up.value, decimalsFor(abs / up.value, up.suffix))}${up.suffix}`;
    }
    return `${text}${unit.suffix}`;
  }
  return String(Math.round(abs));
}

const fansDecimals = (scaled: number, suffix: string) => (suffix === 'B' ? 2 : scaled < 10 && suffix === 'M' ? 2 : scaled < 100 ? 1 : suffix === 'M' ? 1 : 0);
const cashDecimals = (scaled: number, suffix: string) => (suffix === 'K' ? (scaled < 100 ? 1 : 0) : 2);

/** 457.4M (no sign for positives). */
export function fmtFans(n: number): string {
  const v = Math.round(n);
  return `${v < 0 ? '−' : ''}${compact(Math.abs(v), fansDecimals)}`;
}

/** $5.53M */
export function fmtCash(n: number): string {
  const v = Math.round(n);
  return `${v < 0 ? '−' : ''}$${compact(Math.abs(v), cashDecimals)}`;
}

/** +95.8M / −1.2M / 0 */
export function fmtFansDelta(n: number): string {
  return n > 0 ? `+${fmtFans(n)}` : n < 0 ? fmtFans(n) : '0';
}

/** +$958K / −$12K / $0 */
export function fmtCashDelta(n: number): string {
  return n > 0 ? `+${fmtCash(n)}` : n < 0 ? fmtCash(n) : '$0';
}
