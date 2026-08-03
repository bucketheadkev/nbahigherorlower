import { useCallback, useEffect, useRef } from 'react';
import { StickFightEngine } from '../stickfight/engine';
import { renderGame, renderMatchEnd, renderMenu } from '../stickfight/renderer';
import { VIEW_H, VIEW_W } from '../stickfight/constants';
import './GameView.css';

interface GameViewProps {
  phase: 'menu' | 'playing' | 'matchEnd';
  onPhaseChange: (phase: 'menu' | 'playing' | 'matchEnd') => void;
}

export function GameView({ phase, onPhaseChange }: GameViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<StickFightEngine | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const keysRef = useRef({
    w: false,
    a: false,
    s: false,
    d: false,
    space: false,
    f: false,
  });

  useEffect(() => {
    const engine = new StickFightEngine();
    engineRef.current = engine;

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    const unsub = engine.onUpdate((snap) => {
      if (snap.match.phase === 'matchEnd' && phaseRef.current === 'playing') {
        onPhaseChange('matchEnd');
      }
      if (phaseRef.current === 'playing' || snap.match.phase === 'roundEnd') {
        renderGame(ctx, snap);
      }
    });

    engine.start();

    return () => {
      unsub();
      engine.stop();
      engineRef.current = null;
    };
  }, [onPhaseChange]);

  useEffect(() => {
    if (phase === 'playing') {
      engineRef.current?.startMatch();
    }
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (phase === 'menu') {
      renderMenu(ctx);
    } else if (phase === 'matchEnd') {
      const snap = engineRef.current?.getSnapshot();
      renderMatchEnd(ctx, snap?.match.playerWins ?? 0, snap?.match.aiWins ?? 0);
    }
  }, [phase]);

  const syncInput = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || phaseRef.current !== 'playing') return;
    const k = keysRef.current;
    engine.setPlayerInput({
      left: k.a,
      right: k.d,
      jump: k.space || k.w,
      throw: k.f,
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = keysRef.current;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') k.a = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') k.d = true;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') k.w = true;
      if (e.code === 'Space') {
        k.space = true;
        e.preventDefault();
      }
      if (e.code === 'KeyF') k.f = true;
      syncInput();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = keysRef.current;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') k.a = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') k.d = false;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') k.w = false;
      if (e.code === 'Space') k.space = false;
      if (e.code === 'KeyF') {
        k.f = true;
        syncInput();
        k.f = false;
      }
      syncInput();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [syncInput]);

  const getWorldCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = VIEW_W / rect.width;
    const scaleY = VIEW_H / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    const snap = engineRef.current?.getSnapshot();
    if (!snap) return { x, y };
    const camX = Math.max(0, Math.min((snap.player.x + snap.ai.x) / 2 - VIEW_W / 2, 1400 - VIEW_W));
    return { x: x + camX, y };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const { x, y } = getWorldCoords(e.clientX, e.clientY);
      engineRef.current?.setMouse(x, y);
    },
    [getWorldCoords],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (phaseRef.current === 'menu') {
        onPhaseChange('playing');
        return;
      }
      if (phaseRef.current === 'matchEnd') {
        onPhaseChange('playing');
        return;
      }
      const { x, y } = getWorldCoords(e.clientX, e.clientY);
      engineRef.current?.setMouse(x, y);
      if (e.button === 0) engineRef.current?.setAttackHeld(true);
      if (e.button === 2) engineRef.current?.setBlockHeld(true);
    },
    [getWorldCoords, onPhaseChange],
  );

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) engineRef.current?.setAttackHeld(false);
    if (e.button === 2) engineRef.current?.setBlockHeld(false);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className="game-view">
      <canvas
        ref={canvasRef}
        width={VIEW_W}
        height={VIEW_H}
        className="game-canvas"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
      />
    </div>
  );
}
