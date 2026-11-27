'use client';

import { useEffect } from 'react';
import { ACTIVE_SOLANA_CLUSTER } from '@/lib/solana';
import { buildMwaIdentity, mwaChainsForCluster } from '@/lib/mwa-config';

/**
 * Registers Solana Mobile Wallet Adapter as a Wallet Standard wallet in the browser.
 * lib/wallet.tsx already listens for wallets that register late, so it picks this one up.
 * Must run client-side only (registerMwa is not safe during server rendering).
 */
export default function MwaRegister() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('@solana-mobile/wallet-standard-mobile');
        if (cancelled) return;
        mod.registerMwa({
          appIdentity: buildMwaIdentity(window.location.origin),
          authorizationCache: mod.createDefaultAuthorizationCache(),
          chains: mwaChainsForCluster(ACTIVE_SOLANA_CLUSTER.cluster),
          chainSelector: mod.createDefaultChainSelector(),
          onWalletNotFound: mod.createDefaultWalletNotFoundHandler(),
        });
      } catch (err) {
        console.warn('Mobile Wallet Adapter registration failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
