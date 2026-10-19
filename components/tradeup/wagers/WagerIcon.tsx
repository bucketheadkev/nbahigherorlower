import type { WagerDef } from '@/lib/tradeup/wagers';

/** Minimal line icons for wagers (inherit currentColor). */
export function WagerIcon({ icon }: { icon: WagerDef['icon'] }) {
  const common = {
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (icon) {
    case 'billion':
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="7" />
          <path d="M10 5.5v9M12.4 7.4c-.5-.8-1.4-1.2-2.4-1.2-1.4 0-2.4.7-2.4 1.8 0 2.5 4.9 1.4 4.9 3.9 0 1.1-1.1 1.9-2.5 1.9-1.1 0-2-.5-2.5-1.3" />
        </svg>
      );
    case 'star':
      return (
        <svg {...common}>
          <path d="M10 3.2l2 4.3 4.6.5-3.4 3.1 1 4.6-4.2-2.4-4.2 2.4 1-4.6L3.4 8l4.6-.5z" />
        </svg>
      );
    case 'duo':
      return (
        <svg {...common}>
          <circle cx="7" cy="7.5" r="2.5" />
          <circle cx="13" cy="7.5" r="2.5" />
          <path d="M2.8 16c.4-2.4 2.1-3.8 4.2-3.8s3.8 1.4 4.2 3.8M8.8 16c.4-2.4 2.1-3.8 4.2-3.8s3.8 1.4 4.2 3.8" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <rect x="4.5" y="9" width="11" height="7.5" rx="1.8" />
          <path d="M7 9V6.8a3 3 0 0 1 6 0V9" />
        </svg>
      );
    case 'clutch':
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="6.8" />
          <path d="M10 6.2V10l2.6 1.8" />
          <path d="M10 2v1.2" />
        </svg>
      );
    case 'team':
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="7" />
          <path d="M3 10h14M10 3c2 2 2.8 4.3 2.8 7S12 15 10 17M10 3C8 5 7.2 7.3 7.2 10S8 15 10 17" />
        </svg>
      );
    case 'triple':
      return (
        <svg {...common}>
          <path d="M4 14.5l3-5 3 3 3-6 3 4" />
          <circle cx="7" cy="9.5" r=".2" />
          <circle cx="13" cy="6.5" r=".2" />
        </svg>
      );
    case 'crown':
      return (
        <svg {...common}>
          <path d="M3.5 7l3.2 3 3.3-5 3.3 5 3.2-3-1.4 8H4.9z" />
        </svg>
      );
  }
}
