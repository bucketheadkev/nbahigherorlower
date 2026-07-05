interface AdSlotProps {
  className?: string;
}

export function AdSlot({ className = '' }: AdSlotProps) {
  return (
    <div className={`ad-slot ${className}`}>
      <p className="mb-2 text-center text-[10px] font-medium uppercase tracking-widest text-white/25">
        Advertisement
      </p>
      <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] sm:h-28">
        <span className="text-xs text-white/20">Ad space</span>
      </div>
    </div>
  );
}
