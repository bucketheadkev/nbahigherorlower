/**
 * "BUILD YOUR FRANCHISE" is shown once. Signed-in players are also marked on the server
 * (franchise_profile.intro_seen_at) so it follows them across devices; this device list covers
 * guests, the moment before the server answers, and signing out and back in.
 */

const KEY = 'oneb_franchise_intro_seen_v1';

function read(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-20)));
  } catch {
    /* private mode */
  }
}

/** `account` is the user id, 'guest', or 'preview'. A guest who saw it never sees it again after signing in. */
export function introSeenLocally(account: string): boolean {
  const list = read();
  return list.includes(account) || (account !== 'preview' && list.includes('guest'));
}

export function markIntroSeenLocally(account: string): void {
  const list = read();
  if (!list.includes(account)) write([...list, account]);
}

export function clearIntroSeenLocally(account: string): void {
  write(read().filter((a) => a !== account));
}
