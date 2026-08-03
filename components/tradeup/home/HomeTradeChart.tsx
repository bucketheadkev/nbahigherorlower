'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface HomeTradeChartProps {
  large?: boolean;
}

interface ChartPoint {
  tier: string;
  value: number;
  axisLabel: string;
  tooltipTitle: string;
  tooltipSubtitle: string;
  tooltipDetail: string;
}

/** Illustrative asset-value climb from F-tier starter to S-tier peak. */
const POINTS: ChartPoint[] = [
  {
    tier: 'F',
    value: 30,
    axisLabel: 'F',
    tooltipTitle: 'F Tier',
    tooltipSubtitle: 'Starting Player',
    tooltipDetail: 'Trade Value: Low',
  },
  {
    tier: 'D',
    value: 46,
    axisLabel: 'D',
    tooltipTitle: 'D Tier',
    tooltipSubtitle: 'First Successful Trade',
    tooltipDetail: 'Asset Value Increased',
  },
  {
    tier: 'C',
    value: 58,
    axisLabel: 'C',
    tooltipTitle: 'C Tier',
    tooltipSubtitle: 'Momentum Building',
    tooltipDetail: 'Asset Value Increased',
  },
  {
    tier: 'B',
    value: 72,
    axisLabel: 'B',
    tooltipTitle: 'B Tier',
    tooltipSubtitle: 'Valuable Trade Asset',
    tooltipDetail: 'Asset Value Increased',
  },
  {
    tier: 'A',
    value: 84,
    axisLabel: 'A',
    tooltipTitle: 'A Tier',
    tooltipSubtitle: 'Elite Asset',
    tooltipDetail: 'Asset Value Increased',
  },
  {
    tier: 'S',
    value: 96,
    axisLabel: 'S',
    tooltipTitle: 'S Tier',
    tooltipSubtitle: 'Peak Trade Value',
    tooltipDetail: 'Maximum Asset Value',
  },
];

const W = 520;
const H = 200;
const PAD = { t: 16, r: 16, b: 34, l: 40 };
const chartW = W - PAD.l - PAD.r;
const chartH = H - PAD.t - PAD.b;

function scaleX(i: number) {
  return PAD.l + (i / (POINTS.length - 1)) * chartW;
}

function scaleY(v: number) {
  const min = 20;
  const max = 100;
  return PAD.t + chartH - ((v - min) / (max - min)) * chartH;
}

const linePath = POINTS.map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(p.value)}`).join(
  ' ',
);

const areaPath = `${linePath} L ${scaleX(POINTS.length - 1)} ${PAD.t + chartH} L ${scaleX(0)} ${PAD.t + chartH} Z`;

export function HomeTradeChart({ large }: HomeTradeChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timers = POINTS.map((_, i) =>
      window.setTimeout(() => setActiveIndex(i), 280 + i * 200),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const hoveredPoint = hovered !== null ? POINTS[hovered] : null;

  return (
    <div className={`home-panel home-chart-panel${large ? ' home-chart-panel--large' : ''}`}>
      <div className="home-panel-header">
        <span className="home-panel-label">Trade Progression</span>
        <span className="home-panel-meta">F-tier to S-tier</span>
      </div>

      <div className="home-chart-stage">
        <svg
          className="home-chart"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Chart showing asset value increasing from F tier through S tier with each successful trade"
        >
          {[0, 1, 2, 3].map((i) => {
            const y = PAD.t + (chartH / 3) * i;
            return (
              <line
                key={i}
                x1={PAD.l}
                y1={y}
                x2={W - PAD.r}
                y2={y}
                className="home-chart-gridline"
              />
            );
          })}
          <motion.path
            d={areaPath}
            className="home-chart-area"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          />
          <motion.path
            d={linePath}
            className="home-chart-line"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
          {POINTS.map((p, i) => {
            const cx = scaleX(i);
            const cy = scaleY(p.value);
            const isActive = activeIndex === i;
            const isPeak = i === POINTS.length - 1 && activeIndex === i;

            return (
              <g key={p.tier}>
                {isActive ? (
                  <motion.circle
                    cx={cx}
                    cy={cy}
                    r={12}
                    className="home-chart-dot-glow"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: isPeak ? 0.55 : 0.42, scale: 1 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                  />
                ) : null}
                <motion.circle
                  cx={cx}
                  cy={cy}
                  r={isActive ? 5 : 4}
                  className={`home-chart-dot${isActive ? ' home-chart-dot--active' : ''}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15 * i + 0.3, duration: 0.25 }}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={14}
                  className="home-chart-hit"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered(null)}
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.tooltipTitle}: ${p.tooltipSubtitle}`}
                />
                <text x={cx} y={H - 20} className="home-chart-axis-label" textAnchor="middle">
                  <tspan x={cx} dy="0">
                    {p.axisLabel}
                  </tspan>
                  <tspan x={cx} dy="10">
                    Tier
                  </tspan>
                </text>
              </g>
            );
          })}
          <text x={8} y={PAD.t + 4} className="home-chart-y-label">
            Asset Value
          </text>
        </svg>

        {hoveredPoint && hovered !== null ? (
          <div
            className="home-chart-tooltip"
            style={{
              left: `${(scaleX(hovered) / W) * 100}%`,
              top: `${(scaleY(hoveredPoint.value) / H) * 100}%`,
            }}
          >
            <span className="home-chart-tooltip__title">{hoveredPoint.tooltipTitle}</span>
            <span className="home-chart-tooltip__subtitle">{hoveredPoint.tooltipSubtitle}</span>
            <span className="home-chart-tooltip__detail">{hoveredPoint.tooltipDetail}</span>
          </div>
        ) : null}
      </div>

      <p className="home-chart-caption">
        Every accepted trade increases your asset&apos;s value. Build the longest trade chain possible
        before running out of lives, then decide whether to cash out for credits or add your final
        player to your franchise.
      </p>
    </div>
  );
}
