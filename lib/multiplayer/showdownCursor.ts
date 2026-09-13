/**
 * Host-gated showdown cursor. Authoritative copy also lives in
 * set_h2h_showdown_cursor — keep the transition rules identical.
 */
export interface ShowdownCursor {
  started: boolean;
  index: number;
  finished: boolean;
  revision: number;
}

export interface ShowdownCommand {
  started: boolean;
  index: number;
  finished: boolean;
}

export const IDLE_SHOWDOWN: ShowdownCursor = {
  started: false,
  index: 0,
  finished: false,
  revision: 0,
};

export function parseShowdownCursor(raw: unknown): ShowdownCursor {
  if (!raw || typeof raw !== 'object') return { ...IDLE_SHOWDOWN };
  const row = raw as Record<string, unknown>;
  const index = Math.round(Number(row.index ?? 0));
  return {
    started: Boolean(row.started),
    index: Number.isFinite(index) ? Math.max(0, Math.min(4, index)) : 0,
    finished: Boolean(row.finished),
    revision: Math.max(0, Math.round(Number(row.revision ?? 0))),
  };
}

export function nextShowdownCursor(
  current: ShowdownCursor,
  command: ShowdownCommand,
): { ok: true; cursor: ShowdownCursor } | { ok: false; error: 'SHOWDOWN_SKIP' | 'SHOWDOWN_STALE' } {
  const index = Math.round(command.index);
  if (!Number.isFinite(index) || index < 0 || index > 4) {
    return { ok: false, error: 'SHOWDOWN_SKIP' };
  }

  const same =
    current.started === command.started &&
    current.index === index &&
    current.finished === command.finished;
  if (current.started && same) {
    return { ok: true, cursor: current };
  }

  if (current.finished) {
    return { ok: false, error: 'SHOWDOWN_STALE' };
  }

  const starting = !current.started && command.started && index === 0 && !command.finished;
  const stepping =
    current.started &&
    command.started &&
    !command.finished &&
    !current.finished &&
    index === current.index + 1;
  const finishing =
    current.started &&
    command.started &&
    command.finished &&
    !current.finished &&
    index === current.index;

  if (!starting && !stepping && !finishing) {
    return { ok: false, error: 'SHOWDOWN_SKIP' };
  }

  return {
    ok: true,
    cursor: {
      started: true,
      index,
      finished: command.finished,
      revision: current.revision + 1,
    },
  };
}
