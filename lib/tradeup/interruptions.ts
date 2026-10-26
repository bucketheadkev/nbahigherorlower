/**
 * Screens that must not be covered by summaries (drafts, 1V1 turns) hold a "busy" claim while
 * they are open. Hosts that show non-urgent overlays wait until every claim is released.
 */

export const INTERRUPTIONS_CHANGED_EVENT = 'oneb:interruptions-changed';

const holds = new Set<symbol>();

export function holdInterruptions(): () => void {
  const token = Symbol('hold');
  holds.add(token);
  window.dispatchEvent(new Event(INTERRUPTIONS_CHANGED_EVENT));
  return () => {
    if (!holds.delete(token)) return;
    window.dispatchEvent(new Event(INTERRUPTIONS_CHANGED_EVENT));
  };
}

export function interruptionsHeld(): boolean {
  return holds.size > 0;
}
