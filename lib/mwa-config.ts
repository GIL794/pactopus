/** Pure config for registering Solana Mobile Wallet Adapter as a Wallet Standard wallet. */
export type MwaChain = 'solana:mainnet' | 'solana:devnet';

export function mwaChainsForCluster(cluster: string): MwaChain[] {
  // Register only the chain the app is configured for, so a devnet build never offers mainnet signing.
  return cluster === 'mainnet-beta' ? ['solana:mainnet'] : ['solana:devnet'];
}

export function buildMwaIdentity(origin: string, name = 'Pactopus') {
  return { name, uri: origin, icon: '/logo.png' };
}
