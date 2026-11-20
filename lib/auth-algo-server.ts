import { NextRequest } from 'next/server';
import algosdk from 'algosdk';
import { prisma, isCloudDbEnabled } from './db';
import { ACTIVE_ALGO_NETWORK } from './algo';
import { isValidSolanaAddress, verifySolanaEd25519Signature } from './solana';
import { consumeNonce, createMemoryNonceStore, NONCE_FORMAT, type NonceStore } from './evm-nonce';
import { AUTH_HEADERS, AUTH_NONCE_MAX_AGE_MS, stableHash, buildSigningText, verifyOwnerSignature, type AuthResult } from './auth';

const memoryNonces = createMemoryNonceStore();
const dbNonces: NonceStore = {
  async insert(key, expiresAt) {
    try {
      await prisma!.authNonce.create({ data: { nonce: key, wallet: key.split(':')[0], expiresAt } });
      return true;
    } catch { return false; }
  },
};

/**
 * Verify a Solana / Solana Seeker Ed25519 signature (`signMessage`) and consume a one-time nonce.
 * Supports base64, Base58, or hex-encoded 64-byte Ed25519 signatures over `buildSigningText()`.
 */
export async function verifySolanaOwnerSignature(
  request: NextRequest,
  bodyRecord: Record<string, unknown> | string | null = null
): Promise<AuthResult> {
  const wallet = (request.headers.get(AUTH_HEADERS.WALLET) || '').trim();
  const signature = (request.headers.get(AUTH_HEADERS.SIGNATURE) || '').trim();
  const nonce = (request.headers.get(AUTH_HEADERS.NONCE) || '').trim();
  const suppliedHash = request.headers.get(AUTH_HEADERS.BODY_HASH);

  if (!wallet || !signature || !nonce) {
    return {
      success: false,
      error: `Missing auth headers: require ${AUTH_HEADERS.WALLET}, ${AUTH_HEADERS.SIGNATURE}, ${AUTH_HEADERS.NONCE}`,
      status: 401,
    };
  }

  if (!NONCE_FORMAT.test(nonce)) {
    return { success: false, error: 'Nonce must be "<epoch ms>:<uuid>".', status: 401 };
  }

  const nonceMs = parseInt(nonce, 10);
  const now = Date.now();
  if (now - nonceMs > AUTH_NONCE_MAX_AGE_MS) {
    return {
      success: false,
      error: `Authentication expired (${AUTH_NONCE_MAX_AGE_MS / 1000}s window). Refresh and sign again.`,
      status: 401,
    };
  }
  if (nonceMs > now + 5_000) {
    return { success: false, error: 'Nonce is in the future (check system clock).', status: 401 };
  }

  if (!isValidSolanaAddress(wallet)) {
    return {
      success: false,
      error: `${AUTH_HEADERS.WALLET} must be a valid Base58 32-byte Solana address.`,
      status: 400,
    };
  }

  const bodyString = typeof bodyRecord === 'string' ? bodyRecord : bodyRecord ? JSON.stringify(bodyRecord) : '';
  const bodyHash = stableHash(bodyString);
  if (!suppliedHash || suppliedHash !== bodyHash) {
    return { success: false, error: 'Request body tampered since signature was issued.', status: 401 };
  }

  const text = buildSigningText({
    wallet,
    nonce,
    method: (request.method || 'GET').toUpperCase(),
    pathname: request.nextUrl.pathname,
    bodyHash,
  });

  const valid = verifySolanaEd25519Signature(text, signature, wallet);
  if (!valid) {
    return {
      success: false,
      error: 'Invalid Solana / Seeker wallet Ed25519 signature.',
      status: 401,
    };
  }

  const useDb = isCloudDbEnabled && prisma;
  if (!useDb && process.env.NODE_ENV === 'production' && process.env.PACTOPUS_ALLOW_DEMO_STORE_FALLBACK !== '1') {
    return { success: false, error: 'Persistent authentication storage unavailable.', status: 503 };
  }

  const fresh = await consumeNonce(useDb ? dbNonces : memoryNonces, wallet, nonce, AUTH_NONCE_MAX_AGE_MS);
  if (!fresh) {
    return { success: false, error: 'Authentication nonce already used or storage unavailable.', status: 401 };
  }

  return { success: true, wallet };
}

/** Verify Pera signData (MX-prefixed ed25519) and consume a DB-backed nonce.
 * This fails closed when the persistent database is unavailable. A signature
 * cannot be replayed on another worker or after the first accepted request.
 */
export async function verifyAlgorandOwnerSignature(
  request: NextRequest,
  bodyRecord: Record<string, unknown> | string | null = null
): Promise<AuthResult> {
  const wallet = request.headers.get(AUTH_HEADERS.WALLET) || '';
  const signature = request.headers.get(AUTH_HEADERS.SIGNATURE) || '';
  const nonce = request.headers.get(AUTH_HEADERS.NONCE) || '';
  const suppliedHash = request.headers.get(AUTH_HEADERS.BODY_HASH);
  if (!isCloudDbEnabled || !prisma) return { success: false, error: 'Persistent authentication storage unavailable.', status: 503 };
  if (!algosdk.isValidAddress(wallet) || !/^[A-Za-z0-9+/]{86}==$/.test(signature) || !/^[0-9]{13}:[0-9a-f-]{36}$/.test(nonce) || !suppliedHash) {
    return { success: false, error: 'Invalid Algorand authentication headers.', status: 401 };
  }
  const delta = Date.now() - Number(nonce.split(':')[0]);
  if (delta < -5000 || delta > AUTH_NONCE_MAX_AGE_MS) return { success: false, error: 'Authentication expired.', status: 401 };
  const bodyString = typeof bodyRecord === 'string' ? bodyRecord : bodyRecord ? JSON.stringify(bodyRecord) : '';
  const bodyHash = stableHash(bodyString);
  if (suppliedHash !== bodyHash) return { success: false, error: 'Request body tampered.', status: 401 };
  const text = buildSigningText({ wallet, nonce, method: request.method.toUpperCase(), pathname: request.nextUrl.pathname, bodyHash });
  let valid = false;
  try {
    // Rekeyed accounts sign with their current auth address, not the spending address.
    const algod = new algosdk.Algodv2('', ACTIVE_ALGO_NETWORK.algodUrl, '');
    const account = await algod.accountInformation(wallet).exclude('all').do();
    const signer = account.authAddr?.toString() || wallet;
    valid = algosdk.verifyBytes(new TextEncoder().encode(text), new Uint8Array(Buffer.from(signature, 'base64')), signer);
  } catch { /* malformed signature or unavailable account state fails closed */ }
  if (!valid) return { success: false, error: 'Invalid Algorand wallet signature.', status: 401 };
  try {
    await prisma.authNonce.create({ data: { nonce: `${wallet}:${nonce}`, wallet, expiresAt: new Date(Number(nonce.split(':')[0]) + AUTH_NONCE_MAX_AGE_MS) } });
  } catch {
    return { success: false, error: 'Authentication nonce already used or storage unavailable.', status: 401 };
  }
  return { success: true, wallet };
}

/** EVM signature check plus one-time nonce use, so a captured request cannot be replayed inside the freshness window. */
export async function verifyEvmOwnerSignature(request: NextRequest, body: Record<string, unknown> | string | null = null): Promise<AuthResult> {
  const result = await verifyOwnerSignature(request, body);
  if (!result.success) return result;
  const useDb = isCloudDbEnabled && prisma;
  if (!useDb && process.env.NODE_ENV === 'production') {
    return { success: false, error: 'Persistent authentication storage unavailable.', status: 503 };
  }
  const nonce = request.headers.get(AUTH_HEADERS.NONCE) || '';
  const fresh = await consumeNonce(useDb ? dbNonces : memoryNonces, result.wallet, nonce, AUTH_NONCE_MAX_AGE_MS);
  if (!fresh) return { success: false, error: 'Authentication nonce already used or storage unavailable.', status: 401 };
  return result;
}

export async function verifyWalletOwnerSignature(request: NextRequest, body: Record<string, unknown> | string | null = null): Promise<AuthResult> {
  const net = request.headers.get(AUTH_HEADERS.NETWORK);
  if (net === 'solana' || net === 'seeker') return verifySolanaOwnerSignature(request, body);
  if (net === 'algorand') return verifyAlgorandOwnerSignature(request, body);
  return verifyEvmOwnerSignature(request, body);
}
