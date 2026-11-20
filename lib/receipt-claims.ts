/**
 * Atomic one-time claim of an on-chain receipt. The first claim of a hash wins,
 * every later claim returns false. Backed by the ConsumedReceipt primary key in
 * Postgres; falls back to a process-local Set only when no database is configured
 * (local development, not durable across restarts or instances).
 */
export interface ClaimStore {
  insert(txHash: string, purpose: string): Promise<boolean>; // false when already present
  remove(txHash: string): Promise<void>;
}

export function createMemoryClaimStore(): ClaimStore {
  const seen = new Set<string>();
  return {
    async insert(h) { if (seen.has(h)) return false; seen.add(h); return true; },
    async remove(h) { seen.delete(h); },
  };
}

export function createReceiptClaimer(store: ClaimStore) {
  return {
    /** true = you now own this receipt; false = it was already used. */
    claim: (txHash: string, purpose: string) => store.insert(txHash.toLowerCase(), purpose),
    /** Give the receipt back (only if the guarded action failed and nothing was granted). */
    release: (txHash: string) => store.remove(txHash.toLowerCase()),
  };
}
