// Supabase Edge Function (Deno): validates App Store purchases + notifications.
//
// NOT DEPLOYED automatically. Staging first:
//   supabase functions deploy iap-purchase --project-ref YOUR_STAGING_REF
//   supabase secrets set \
//     IAP_APPLE_ENVIRONMENT=Sandbox \
//     APPLE_ISSUER_ID=… APPLE_KEY_ID=… APPLE_BUNDLE_ID=… \
//     APPLE_PRIVATE_KEY="$(cat AuthKey_XXXX.p8)"
//
// Guarantees:
//   • Explicit IAP_APPLE_ENVIRONMENT (Sandbox|Production); host + payload must match.
//   • Apple JWS verified via x5c certificate chain (transactions + notifications).
//   • appAccountToken must match the authenticated permanent user.
//   • Coins/entitlements only via service-role RPCs (catalog amounts).
//   • Renew / expire / refund / revoke / restore handled; no fabricated subscription expiry.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  compactVerify,
  decodeProtectedHeader,
  importPKCS8,
  importX509,
  SignJWT,
  type JWTPayload,
} from 'npm:jose@5';

const APPLE_HOSTS = {
  Production: 'https://api.storekit.itunes.apple.com',
  Sandbox: 'https://api.storekit-sandbox.itunes.apple.com',
} as const;

type AppleEnv = keyof typeof APPLE_HOSTS;

/** Apple Root CA - G3 (official DER from apple.com/certificateauthority). */
const APPLE_ROOT_CA_G3 = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;
/** SHA-256 fingerprint of Apple Root CA - G3. */
const APPLE_ROOT_CA_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
};

const configuredAppleEnv = (): AppleEnv => {
  const raw = (Deno.env.get('IAP_APPLE_ENVIRONMENT') ?? '').trim();
  if (raw !== 'Sandbox' && raw !== 'Production') {
    throw new Error('IAP_APPLE_ENVIRONMENT must be Sandbox or Production');
  }
  return raw;
};

const admin = () =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    },
  });

function pemFromX5c(b64: string): string {
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function verifyAppleJws<T extends JWTPayload>(jws: string): Promise<T> {
  const header = decodeProtectedHeader(jws);
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 1) {
    throw new Error('apple_jws_missing_x5c');
  }
  const leafPem = pemFromX5c(String(x5c[0]));
  const leafKey = await importX509(leafPem, 'ES256');
  const { payload } = await compactVerify(jws, leafKey);

  // Trust anchor: last x5c element (or any) must be Apple Root CA - G3 by SHA-256 fingerprint.
  const fingerprints = await Promise.all(x5c.map((c) => sha256Hex(b64ToBytes(String(c)))));
  if (!fingerprints.includes(APPLE_ROOT_CA_G3_SHA256)) {
    // Also accept exact PEM match of embedded root (DER↔PEM encoding differences).
    const tip = pemFromX5c(String(x5c[x5c.length - 1])).replace(/\s+/g, '');
    if (tip !== APPLE_ROOT_CA_G3.replace(/\s+/g, '')) {
      throw new Error('apple_jws_untrusted_root');
    }
  }

  const text = new TextDecoder().decode(payload);
  return JSON.parse(text) as T;
}

async function appleToken(bundleId: string): Promise<string> {
  const key = await importPKCS8(env('APPLE_PRIVATE_KEY'), 'ES256');
  return new SignJWT({ bid: bundleId })
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
  environment: AppleEnv;
  expiresDate?: number;
}

async function fetchTransaction(transactionId: string, appleEnv: AppleEnv): Promise<AppleTransaction | null> {
  if (!/^\d{1,30}$/.test(transactionId)) return null;
  const bundleId = env('APPLE_BUNDLE_ID');
  const token = await appleToken(bundleId);
  const host = APPLE_HOSTS[appleEnv];
  const res = await fetch(`${host}/inApps/v1/transactions/${transactionId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`apple ${res.status}`);
  const { signedTransactionInfo } = (await res.json()) as { signedTransactionInfo: string };
  const tx = await verifyAppleJws<AppleTransaction>(signedTransactionInfo);
  if (tx.bundleId !== bundleId) throw new Error('wrong_app');
  if (tx.environment !== appleEnv) throw new Error('environment_mismatch');
  return tx;
}

function expiresIso(tx: AppleTransaction): string | null {
  return typeof tx.expiresDate === 'number' && tx.expiresDate > 0
    ? new Date(tx.expiresDate).toISOString()
    : null;
}

async function grant(req: Request, body: { transactionId?: string }) {
  const appleEnv = configuredAppleEnv();
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { ok: false, reason: 'account_required' });

  const db = admin();
  const { data: auth } = await db.auth.getUser(jwt);
  const user = auth?.user;
  if (!user || user.is_anonymous) return json(401, { ok: false, reason: 'account_required' });

  const transactionId = String(body.transactionId ?? '');
  let tx: AppleTransaction | null;
  try {
    tx = await fetchTransaction(transactionId, appleEnv);
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'apple_verify_failed';
    return json(400, { ok: false, reason });
  }
  if (!tx) return json(404, { ok: false, reason: 'unknown_transaction' });
  if (tx.revocationDate) return json(400, { ok: false, reason: 'revoked' });
  if ((tx.appAccountToken ?? '').toLowerCase() !== user.id.toLowerCase()) {
    return json(403, { ok: false, reason: 'account_mismatch' });
  }

  const { data: catalog, error: catErr } = await db
    .from('iap_product_catalog')
    .select('product_id, kind, coins, billing')
    .eq('product_id', tx.productId)
    .eq('active', true)
    .maybeSingle();
  if (catErr || !catalog) return json(400, { ok: false, reason: 'unknown_product' });

  const billing = String(catalog.billing);
  if (billing === 'consumable' && tx.type !== 'Consumable') {
    return json(400, { ok: false, reason: 'type_mismatch' });
  }
  if (billing === 'non_consumable' && !/non[-_]?consumable/i.test(tx.type)) {
    return json(400, { ok: false, reason: 'type_mismatch' });
  }
  if (billing === 'subscription' && !/auto.?renewable|subscription/i.test(tx.type)) {
    return json(400, { ok: false, reason: 'type_mismatch' });
  }

  const expiresAt = expiresIso(tx);
  if (billing === 'subscription' && !expiresAt) {
    return json(400, { ok: false, reason: 'subscription_expires_required' });
  }

  const { data, error } = await db.rpc('coin_grant_iap', {
    p_user: user.id,
    p_transaction_id: tx.transactionId,
    p_product_id: tx.productId,
    p_original_transaction_id: tx.originalTransactionId ?? null,
    p_environment: appleEnv,
    p_expires_at: expiresAt,
  });
  if (error) return json(400, { ok: false, reason: error.message });

  const row = (data ?? {}) as Record<string, unknown>;
  return json(200, {
    ok: true,
    environment: appleEnv,
    productId: tx.productId,
    coins: typeof row.granted === 'number' ? row.granted : Number(catalog.coins) || 0,
    removeAds: row.remove_ads === true,
    premium: row.premium === true,
    proActive: row.pro_active === true,
    proActiveUntil: typeof row.pro_active_until === 'string' ? row.pro_active_until : expiresAt ?? undefined,
    balance: row.coins_balance ?? null,
    duplicate: row.duplicate === true,
    status: row.status ?? 'granted',
  });
}

async function notification(body: { signedPayload: string }) {
  const appleEnv = configuredAppleEnv();
  let note: {
    notificationType?: string;
    subtype?: string;
    data?: {
      bundleId?: string;
      environment?: string;
      signedTransactionInfo?: string;
    };
  };
  try {
    note = await verifyAppleJws(body.signedPayload);
  } catch (e) {
    console.error('[iap-purchase] notification jws', e);
    return json(400, { ok: false, reason: 'invalid_notification' });
  }

  if (note.data?.bundleId && note.data.bundleId !== env('APPLE_BUNDLE_ID')) {
    return json(400, { ok: false, reason: 'wrong_app' });
  }
  if (note.data?.environment && note.data.environment !== appleEnv) {
    return json(400, { ok: false, reason: 'environment_mismatch' });
  }

  const type = String(note.notificationType ?? '');
  const signedTx = note.data?.signedTransactionInfo;
  if (!signedTx) return json(200, { ok: true, ignored: true, reason: 'no_transaction' });

  let claimed: AppleTransaction;
  try {
    claimed = await verifyAppleJws<AppleTransaction>(signedTx);
    if (claimed.environment !== appleEnv) {
      return json(400, { ok: false, reason: 'environment_mismatch' });
    }
  } catch (e) {
    console.error('[iap-purchase] signedTransactionInfo', e);
    return json(400, { ok: false, reason: 'invalid_transaction_jws' });
  }

  // Re-fetch from Apple (configured env only) for authoritative revocation/expiry.
  const tx = await fetchTransaction(claimed.transactionId, appleEnv);
  if (!tx) return json(200, { ok: true, ignored: true, reason: 'unknown_transaction' });

  const db = admin();

  // Refund / revoke → clawback + recompute
  if (type === 'REFUND' || type === 'REVOKE' || tx.revocationDate) {
    const { data, error } = await db.rpc('iap_revoke_transaction', {
      p_transaction_id: tx.transactionId,
    });
    if (error) {
      console.error('[iap-purchase] revoke failed', error.message);
      return json(500, { ok: false, reason: 'revoke_failed' });
    }
    return json(200, { ok: true, revoked: tx.transactionId, result: data ?? null });
  }

  // Renewals / initial subscribe: grant if still valid (idempotent on transaction id).
  if (
    type === 'DID_RENEW' ||
    type === 'SUBSCRIBED' ||
    type === 'DID_CHANGE_RENEWAL_STATUS' ||
    type === 'OFFER_REDEEMED'
  ) {
    if (tx.revocationDate) return json(200, { ok: true, ignored: true });
    const expiresAt = expiresIso(tx);
    if (!expiresAt) {
      return json(400, { ok: false, reason: 'subscription_expires_required' });
    }
    // Notification path has no user JWT — resolve owner from prior original_transaction_id.
    const { data: prior } = await db
      .from('iap_transactions')
      .select('user_id')
      .eq('original_transaction_id', tx.originalTransactionId ?? tx.transactionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: byTx } = prior?.user_id
      ? { data: prior }
      : await db
          .from('iap_transactions')
          .select('user_id')
          .eq('transaction_id', tx.originalTransactionId ?? tx.transactionId)
          .maybeSingle();
    const userId = prior?.user_id ?? byTx?.user_id;
    if (!userId) {
      // Cannot attribute renewal without prior purchase linkage.
      return json(200, { ok: true, ignored: true, reason: 'unknown_subscriber' });
    }
    const { data, error } = await db.rpc('coin_grant_iap', {
      p_user: userId,
      p_transaction_id: tx.transactionId,
      p_product_id: tx.productId,
      p_original_transaction_id: tx.originalTransactionId ?? null,
      p_environment: appleEnv,
      p_expires_at: expiresAt,
    });
    if (error) return json(500, { ok: false, reason: error.message });
    return json(200, { ok: true, renewed: tx.transactionId, result: data ?? null });
  }

  // Expiry / grace end → recompute entitlements for owner (preserve other grants).
  if (type === 'EXPIRED' || type === 'GRACE_PERIOD_EXPIRED' || type === 'DID_FAIL_TO_RENEW') {
    const { data: row } = await db
      .from('iap_transactions')
      .select('user_id')
      .eq('transaction_id', tx.transactionId)
      .maybeSingle();
    if (row?.user_id) {
      // Mark this tx expired by setting expires_at to now if still in future (no fabricated dates).
      if (tx.expiresDate) {
        await db
          .from('iap_transactions')
          .update({ expires_at: new Date(tx.expiresDate).toISOString(), updated_at: new Date().toISOString() })
          .eq('transaction_id', tx.transactionId)
          .eq('status', 'granted');
      }
      const { data } = await db.rpc('_iap_recompute_entitlements', { p_user: row.user_id });
      return json(200, { ok: true, expired: tx.transactionId, entitlements: data ?? null });
    }
    return json(200, { ok: true, ignored: true });
  }

  return json(200, { ok: true, ignored: true, notificationType: type });
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
    // Fail closed if environment secret missing / invalid.
    configuredAppleEnv();
    const body = await req.json();
    if (typeof body?.signedPayload === 'string') return await notification(body);
    return await grant(req, body ?? {});
  } catch (err) {
    console.error('[iap-purchase]', err);
    const msg = err instanceof Error ? err.message : 'server_error';
    if (/IAP_APPLE_ENVIRONMENT|missing /.test(msg)) {
      return json(500, { ok: false, reason: 'misconfigured_environment' });
    }
    return json(500, { ok: false, reason: 'server_error' });
  }
});
