import algosdk from 'algosdk';
// Algorand configuration and helpers
// USDC Asset ID: 10458941 (Testnet), 31566704 (Mainnet)
// EURC Asset ID: 230190169 (Testnet), 227839352 (Mainnet)
// Pactopus maps this workspace to the documented Algorand palette tokens so the UI matches the active chain branding.

export const ALGO_NETWORKS = {
  testnet: {
    id: 'testnet',
    name: 'Algorand Testnet',
    genesisId: 'testnet-v1.0',
    genesisHash: 'SGO1GKSzyE7IEPChxPGCO/RJlhGYdBZqRrUs68Jway8=',
    algodUrl: 'https://testnet-api.algonode.cloud',
    indexerUrl: 'https://testnet-idx.algonode.cloud',
    explorerUrl: 'https://testnet.explorer.perawallet.app',
    tokens: {
      USDC: {
        assetId: 10458941,
        decimals: 6,
        color: '#10b981',
        icon: '💵',
        description: 'USDC on Algorand Testnet',
      },
      EURC: {
        assetId: 230190169,
        decimals: 6,
        color: '#f59e0b',
        icon: '💶',
        description: 'EURC on Algorand Testnet',
      },
    },
  },
  mainnet: {
    id: 'mainnet',
    name: 'Algorand Mainnet',
    genesisId: 'mainnet-v1.0',
    genesisHash: 'wGHE2pwdvdggwZB1VYClaG57cVFLBkRyIJKMRkIa5gQ=',
    algodUrl: 'https://mainnet-api.algonode.cloud',
    indexerUrl: 'https://mainnet-idx.algonode.cloud',
    explorerUrl: 'https://explorer.perawallet.app',
    tokens: {
      USDC: {
        assetId: 31566704,
        decimals: 6,
        color: '#10b981',
        icon: '💵',
        description: 'USDC on Algorand Mainnet',
      },
      EURC: {
        assetId: 227839352,
        decimals: 6,
        color: '#f59e0b',
        icon: '💶',
        description: 'EURC on Algorand Mainnet',
      },
    },
  },
};

export const ACTIVE_ALGO_NETWORK = ALGO_NETWORKS.testnet;

export const ALGO_PLATFORM_WALLET =
  process.env.NEXT_PUBLIC_ALGO_PLATFORM_WALLET || '';

export type AlgoCurrency = 'USDC' | 'EURC' | 'ALGO';

export function getAlgoTxLink(txId: string): string {
  return `${ACTIVE_ALGO_NETWORK.explorerUrl}/tx/${txId}`;
}

/**
 * Validate Algorand address format
 */
export function isValidAlgorandAddress(address: string): boolean {
  return algosdk.isValidAddress(address);
}
