export type SpinBoxSnapshot = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type SpinHandoff = {
  team: SpinBoxSnapshot | null;
  era: SpinBoxSnapshot | null;
};

let pending: SpinHandoff | null = null;

export function publishSpinHandoff(next: SpinHandoff) {
  pending = next;
}

export function peekSpinHandoff(): SpinHandoff | null {
  return pending;
}

export function consumeSpinHandoff(): SpinHandoff | null {
  const value = pending;
  pending = null;
  return value;
}
