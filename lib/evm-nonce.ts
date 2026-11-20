/** Nonce format shared by client and server: 13-digit epoch ms, a colon, then a UUID. */
export const NONCE_FORMAT = /^[0-9]{13}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface NonceStore { insert(key: string, expiresAt: Date): Promise<boolean> }

export function createMemoryNonceStore(): NonceStore {
  const seen = new Set<string>();
  return { async insert(k) { if (seen.has(k)) return false; seen.add(k); return true; } };
}

/** One-time use: the first presentation of (wallet, nonce) succeeds, any repeat is refused. */
export async function consumeNonce(store: NonceStore, wallet: string, nonce: string, maxAgeMs: number): Promise<boolean> {
  const issuedAt = Number(nonce.split(':')[0]);
  return store.insert(`${wallet.toLowerCase()}:${nonce}`, new Date(issuedAt + maxAgeMs));
}
