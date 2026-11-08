// Supabase Edge Function (Deno): validates App Store key purchases and refunds.
//
// NOT DEPLOYED. Deploy once App Store Connect products exist:
//   supabase functions deploy key-purchase
//   supabase secrets set APPLE_ISSUER_ID=… APPLE_KEY_ID=… APPLE_BUNDLE_ID=… APPLE_PRIVATE_KEY="$(cat AuthKey_XXXX.p8)"
// and point App Store Server Notifications (V2) at this function's URL for refunds.
//
// Two entry points, one URL:
//   • App: POST { transactionId } with the player's session token. The transaction is fetched
//     from the App Store Server API (never trusted from the device), checked, and granted once.
//   • Apple: POST { signedPayload } (Server Notifications V2). For REFUND / REVOKE the
//     transaction is re-fetched from Apple before any keys are taken back.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { decodeJwt, importPKCS8, SignJWT } from 'npm:jose@5';

const APPLE_HOSTS = {
  Production: 'https://api.storekit.itunes.apple.com',
  Sandbox: 'https://api.storekit-sandbox.itunes.apple.com',
} as const;

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
};

const admin = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function appleToken(): Promise<string> {
  const key = await importPKCS8(env('APPLE_PRIVATE_KEY'), 'ES256');
  return new SignJWT({ bid: env('APPLE_BUNDLE_ID') })
    .setProtectedHeader({ alg: 'ES256', kid: env('APPLE_KEY_ID'), typ: 'JWT' })
    .setIssuer(env('APPLE_ISSUER_ID'))
    .setAudience('appstoreconnect-v1')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(key);
}

interface AppleTransaction {
  transactionId: string;
  originalTransactionId?: string;
  bundleId: string;
  productId: string;
  type: string;
  appAccountToken?: string;
  revocationDate?: number;
  environment: 'Production' | 'Sandbox';
}

/** Production first; Apple answers 404 there for sandbox (TestFlight / review) purchases. */
async function fetchTransaction(transactionId: string): Promise<AppleTransaction | null> {
  if (!/^\d{1,30}$/.test(transactionId)) return null;
  const token = await appleToken();
  for (const host of [APPLE_HOSTS.Production, APPLE_HOSTS.Sandbox]) {
    const res = await fetch(`${host}/inApps/v1/transactions/${transactionId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`apple ${res.status}`);
    const { signedTransactionInfo } = (await res.json()) as { signedTransactionInfo: string };
    // Fetched directly from Apple over TLS with our own credentials, so the payload is authentic.
    return decodeJwt(signedTransactionInfo) as unknown as AppleTransaction;
  }
  return null;
}

async function grant(req: Request, body: { transactionId?: string }) {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const db = admin();
  const { data: auth } = await db.auth.getUser(jwt);
  const user = auth?.user;
  if (!user || user.is_anonymous) return json(401, { ok: false, reason: 'account_required' });

  const transactionId = String(body.transactionId ?? '');
  const tx = await fetchTransaction(transactionId);
  if (!tx) return json(404, { ok: false, reason: 'unknown_transaction' });
  if (tx.bundleId !== env('APPLE_BUNDLE_ID')) return json(400, { ok: false, reason: 'wrong_app' });
  if (tx.type !== 'Consumable') return json(400, { ok: false, reason: 'not_consumable' });
  if (tx.revocationDate) return json(400, { ok: false, reason: 'revoked' });
  // The app buys with appAccountToken = account id, so a purchase can't be redeemed by someone else.
  if ((tx.appAccountToken ?? '').toLowerCase() !== user.id.toLowerCase()) {
    return json(403, { ok: false, reason: 'account_mismatch' });
  }

  const { data, error } = await db.rpc('dynasty_grant_key_purchase', {
    p_user_id: user.id,
    p_transaction_id: tx.transactionId,
    p_product_id: tx.productId,
    p_environment: tx.environment,
  });
  if (error) return json(400, { ok: false, reason: error.message });
  return json(200, { ok: true, keys: (data as { keys?: number })?.keys ?? null, granted: (data as { granted?: number })?.granted ?? 0 });
}

async function notification(body: { signedPayload: string }) {
  const note = decodeJwt(body.signedPayload) as { notificationType?: string; data?: { signedTransactionInfo?: string } };
  if (note.notificationType !== 'REFUND' && note.notificationType !== 'REVOKE') return json(200, { ok: true, ignored: true });
  const claimed = note.data?.signedTransactionInfo ? (decodeJwt(note.data.signedTransactionInfo) as { transactionId?: string }) : null;
  if (!claimed?.transactionId) return json(200, { ok: true, ignored: true });
  // Never act on the notification's own claim: confirm the revocation with Apple first.
  const tx = await fetchTransaction(claimed.transactionId);
  if (!tx?.revocationDate) return json(200, { ok: true, ignored: true });
  const { data, error } = await admin().rpc('dynasty_revoke_key_purchase', {
    p_transaction_id: tx.transactionId,
    p_reason: note.notificationType.toLowerCase(),
  });
  if (error) return json(500, { ok: false });
  return json(200, data);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
      },
    });
  }
  if (req.method !== 'POST') return json(405, { ok: false });
  try {
    const body = await req.json();
    if (typeof body?.signedPayload === 'string') return await notification(body);
    return await grant(req, body ?? {});
  } catch (err) {
    console.error('[key-purchase]', err);
    return json(500, { ok: false, reason: 'server_error' });
  }
});
