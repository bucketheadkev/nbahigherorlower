'use client';

import { useCallback, useRef, useState } from 'react';
import { buildPerfectSeasonShareText } from '@/lib/tradeup/achievements';
import { ChampionshipRingVisual } from './ChampionshipRingVisual';

interface PerfectSeasonShareCardProps {
  lineup: string[];
}

function drawShareImage(lineup: string[]): Promise<Blob | null> {
  const width = 1080;
  const height = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#1a1408');
  bg.addColorStop(0.45, '#0d0e12');
  bg.addColorStop(1, '#08090c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Gold vignette
  const glow = ctx.createRadialGradient(width / 2, 280, 40, width / 2, 320, 520);
  glow.addColorStop(0, 'rgba(232, 196, 90, 0.35)');
  glow.addColorStop(1, 'rgba(232, 196, 90, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Border
  ctx.strokeStyle = 'rgba(232, 196, 90, 0.55)';
  ctx.lineWidth = 8;
  ctx.strokeRect(36, 36, width - 72, height - 72);

  ctx.fillStyle = '#ead78f';
  ctx.font = '700 42px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BALLION', width / 2, 140);

  ctx.fillStyle = '#fff4b8';
  ctx.font = '850 56px system-ui, sans-serif';
  ctx.fillText('PERFECT SEASON', width / 2, 230);

  // Ring circle
  const ringY = 430;
  const ringGrad = ctx.createLinearGradient(width / 2 - 90, ringY - 90, width / 2 + 90, ringY + 90);
  ringGrad.addColorStop(0, '#fff4c2');
  ringGrad.addColorStop(0.5, '#e8c45a');
  ringGrad.addColorStop(1, '#b8891f');
  ctx.beginPath();
  ctx.arc(width / 2, ringY, 78, 0, Math.PI * 2);
  ctx.strokeStyle = ringGrad;
  ctx.lineWidth = 28;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(width / 2 - 38, ringY - 70);
  ctx.lineTo(width / 2 - 18, ringY - 118);
  ctx.lineTo(width / 2, ringY - 86);
  ctx.lineTo(width / 2 + 18, ringY - 118);
  ctx.lineTo(width / 2 + 38, ringY - 70);
  ctx.closePath();
  ctx.fillStyle = ringGrad;
  ctx.fill();

  ctx.fillStyle = '#f7f4ea';
  ctx.font = '850 140px system-ui, sans-serif';
  ctx.fillText('82–0', width / 2, 640);

  ctx.fillStyle = 'rgba(245, 245, 244, 0.72)';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText('STARTING FIVE', width / 2, 740);

  ctx.fillStyle = '#f5f5f4';
  ctx.font = '700 40px system-ui, sans-serif';
  lineup.forEach((name, index) => {
    ctx.fillText(name, width / 2, 820 + index * 58);
  });

  ctx.fillStyle = 'rgba(232, 196, 90, 0.8)';
  ctx.font = '600 30px system-ui, sans-serif';
  ctx.fillText('Championship ring earned', width / 2, 1180);

  ctx.fillStyle = 'rgba(245, 245, 244, 0.45)';
  ctx.font = '500 26px system-ui, sans-serif';
  ctx.fillText('Chase 82–0', width / 2, 1240);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

export function PerfectSeasonShareCard({ lineup }: PerfectSeasonShareCardProps) {
  const [status, setStatus] = useState<string | null>(null);
  const busyRef = useRef(false);

  const handleShare = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus(null);

    const text = buildPerfectSeasonShareText(lineup);
    try {
      const blob = await drawShareImage(lineup);
      const file =
        blob != null
          ? new File([blob], 'trade-up-perfect-season.png', { type: 'image/png' })
          : null;

      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: 'Ballion — Perfect Season',
          text,
          files: [file],
        });
        setStatus('Shared');
        return;
      }

      if (navigator.share) {
        await navigator.share({ title: 'Ballion — Perfect Season', text });
        setStatus('Shared');
        return;
      }

      if (file) {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'trade-up-perfect-season.png';
        link.click();
        URL.revokeObjectURL(url);
        await navigator.clipboard.writeText(text);
        setStatus('Graphic saved · text copied');
        return;
      }

      await navigator.clipboard.writeText(text);
      setStatus('Copied to clipboard');
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        setStatus('Copied to clipboard');
      } catch {
        setStatus('Share unavailable');
      }
    } finally {
      busyRef.current = false;
      window.setTimeout(() => setStatus(null), 2200);
    }
  }, [lineup]);

  return (
    <div className="perfect-share">
      <article className="perfect-share__card" aria-label="Shareable perfect season result">
        <p className="perfect-share__eyebrow">Ballion</p>
        <ChampionshipRingVisual size="lg" />
        <h3 className="perfect-share__title">Perfect Season</h3>
        <p className="perfect-share__record">82–0</p>
        <ul className="perfect-share__lineup">
          {lineup.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <p className="perfect-share__foot">Championship ring earned</p>
      </article>

      <button type="button" className="tu-btn tu-btn--secondary perfect-share__btn" onClick={handleShare}>
        Share Result
      </button>
      {status ? (
        <p className="perfect-share__status" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
