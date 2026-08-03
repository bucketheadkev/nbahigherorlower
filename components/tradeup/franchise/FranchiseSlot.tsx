'use client';

import type { ReactNode } from 'react';

interface FranchiseSlotProps {
  label: string;
  playerId: string | null;
  zone: 'starting' | 'bench';
  slotIndex: number;
  isDragOver: boolean;
  draggingId: string | null;
  isNew?: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  children?: ReactNode;
  renderCard: (playerId: string) => ReactNode;
}

export function FranchiseSlot({
  label,
  playerId,
  zone,
  isDragOver,
  draggingId,
  onDragOver,
  onDragLeave,
  onDrop,
  renderCard,
}: FranchiseSlotProps) {
  return (
    <div
      className={`franchise-slot franchise-slot--${zone}${isDragOver ? ' franchise-slot--drag-over' : ''}${draggingId && !playerId ? ' franchise-slot--can-drop' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {playerId ? (
        renderCard(playerId)
      ) : (
        <div className="franchise-empty-slot">
          <span className="franchise-empty-label">{label}</span>
        </div>
      )}
    </div>
  );
}
