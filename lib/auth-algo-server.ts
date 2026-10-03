import { NextRequest } from 'next/server';
import algosdk from 'algosdk';
import { prisma, isCloudDbEnabled } from './db';
import { ACTIVE_ALGO_NETWORK } from './algo';
import { AUTH_HEADERS, AUTH_NONCE_MAX_AGE_MS, stableHash, buildSigningText, verifyOwnerSignature, type AuthResult } from './auth';

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

export async function verifyWalletOwnerSignature(request: NextRequest, body: Record<string, unknown> | string | null = null): Promise<AuthResult> {
  if (request.headers.get(AUTH_HEADERS.NETWORK) === 'algorand') return verifyAlgorandOwnerSignature(request, body);
  return verifyOwnerSignature(request, body);
}
