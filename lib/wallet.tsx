// Wallet connection context — Solana Seeker (Seed Vault MWA 2.0), Phantom (Solana), Solflare, Backpack + legacy Arc/Algorand support
'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ARC_CHAIN, switchToArc, CURRENCY_CONFIG } from '@/lib/arc';
import { recordMilestone } from '@/lib/milestones';
import algosdk from 'algosdk';
import { ACTIVE_ALGO_NETWORK } from '@/lib/algo';
import { ACTIVE_SOLANA_NETWORK, SOLANA_MINTS, encodeBase58, isValidSolanaAddress, isValidSolanaSignature } from '@/lib/solana';
import { detectSeekerHardwareEnvironment, checkSeekerGenesisTokenOnChain } from '@/lib/seeker';
import type { SupportedNetworkId } from '@/lib/store';

export interface InjectedSolanaProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  isSeeker?: boolean;
  isSeedVault?: boolean;
  isMobileWalletAdapter?: boolean;
  publicKey?: { toBase58: () => string; toString: () => string };
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toBase58?: () => string; toString: () => string } }>;
  disconnect?: () => Promise<void>;
  signMessage?: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array } | Uint8Array>;
  signAndSendTransaction?: (
    transaction: unknown,
    options?: Record<string, unknown>
  ) => Promise<{ signature?: string } | string>;
  signTransaction?: (transaction: unknown) => Promise<{ serialize?: () => Uint8Array } | Uint8Array>;
  request?: (args: { method: string; params?: Record<string, unknown> }) => Promise<{ signature?: string } | string>;
  on?: (event: string, callback: (arg: unknown) => void) => void;
  removeListener?: (event: string, callback: (arg: unknown) => void) => void;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethereum?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    algorand?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    algo?: any;
    solana?: InjectedSolanaProvider;
    solflare?: InjectedSolanaProvider;
    backpack?: { solana?: InjectedSolanaProvider };
    phantom?: {
      solana?: InjectedSolanaProvider;
      ethereum?: InjectedEthereumProvider;
    };
  }
}

export type WalletType =
  | 'seeker'
  | 'phantom-solana'
  | 'solflare'
  | 'backpack'
  | 'metamask'
  | 'phantom'
  | 'coinbase'
  | 'walletconnect'
  | 'pera'
  | null;

interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  walletType: WalletType;
  chainId: number | null;
  isWrongNetwork: boolean;
  usdcBalance: string;
  eurcBalance: string;
  error: string | null;
  network: SupportedNetworkId;
  seekerVerified: boolean;
  seekerVerificationReason: string;
  seekerFeeBps: 25 | 50;
  seekerMaxCapGbp: 5 | 50;
}

export interface InjectedEthereumProvider {
  isMetaMask?: boolean;
  isPhantom?: boolean;
  isExodus?: boolean;
  isCoinbaseWallet?: boolean;
  isTalisman?: boolean;
  providers?: InjectedEthereumProvider[];
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, callback: (arg: unknown) => void) => void;
  removeListener?: (event: string, callback: (arg: unknown) => void) => void;
}

interface WalletContextType extends WalletState {
  connect: (type: WalletType) => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  setNetwork: (network: SupportedNetworkId) => void;
  toggleSeekerMode: () => void;
  getActiveEvmProvider: () => InjectedEthereumProvider | null;
  getActiveSolanaProvider: () => InjectedSolanaProvider | null;
  /** Sign the request with Solana Ed25519 signMessage, EVM personal_sign, or Pera Algorand signData. */
  signMessage: (message: string) => Promise<string>;
  /** Sign and broadcast a base64-serialized Solana wire transaction via the connected Solana wallet. */
  signAndSendSolanaTransaction: (transactionBase64: string) => Promise<string>;
  signAlgorandGroup: (transactions: algosdk.Transaction[], onSigned?: (txid: string) => void) => Promise<string>;
}

interface PeraWalletClient {
  connect: () => Promise<string[]>;
  disconnect: () => Promise<void>;
  reconnectSession: () => Promise<string[]>;
  connector?: {
    on: (event: string, callback: () => void) => void;
  } | null;
  signData: (data: Array<{ data: Uint8Array; message: string }>, signer: string, verifySignature?: boolean) => Promise<Uint8Array[]>;
  signTransaction: (txGroups: Array<Array<{ txn: algosdk.Transaction }>>, address: string) => Promise<Uint8Array[]>;
}

const WalletContext = createContext<WalletContextType | null>(null);
const STORAGE_KEY = 'pactopus_wallet';
const NETWORK_STORAGE_KEY = 'pactopus_network';

function detectInitialNetwork(): SupportedNetworkId {
  if (typeof window === 'undefined') return 'solana';

  const savedPref = localStorage.getItem(NETWORK_STORAGE_KEY) as SupportedNetworkId | null;
  if (savedPref === 'solana' || savedPref === 'seeker' || savedPref === 'arc' || savedPref === 'algorand') {
    return savedPref;
  }

  const savedSession = localStorage.getItem(STORAGE_KEY);
  if (savedSession) {
    try {
      const { network } = JSON.parse(savedSession);
      if (network === 'solana' || network === 'seeker' || network === 'arc' || network === 'algorand') {
        return network;
      }
    } catch { /* ignore */ }
  }

  const hw = detectSeekerHardwareEnvironment();
  if (hw.detected) return 'seeker';

  return 'solana';
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(() => {
    const net = detectInitialNetwork();
    const hw = typeof window !== 'undefined' ? detectSeekerHardwareEnvironment() : { detected: false, reason: 'Standard Solana Web Mode (0.50% · £50 Max Cap)' };
    const isHardwareVerified = hw.detected;
    return {
      address: null,
      isConnected: false,
      isConnecting: false,
      walletType: null,
      chainId: null,
      isWrongNetwork: false,
      usdcBalance: '0.00',
      eurcBalance: '0.00',
      error: null,
      network: net,
      seekerVerified: isHardwareVerified,
      seekerVerificationReason: isHardwareVerified
        ? hw.reason
        : net === 'seeker'
          ? 'Seeker Theme Preview (Connect Seeker Phone or Genesis Token to unlock 0.25% · £5 Max Cap)'
          : 'Standard Solana Web Mode (0.50% · £50 Max Cap)',
      seekerFeeBps: isHardwareVerified ? 25 : 50,
      seekerMaxCapGbp: isHardwareVerified ? 5 : 50,
    };
  });

  const [peraWallet, setPeraWallet] = useState<PeraWalletClient | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('@perawallet/connect')
        .then(({ PeraWalletConnect }) => {
          setPeraWallet(new PeraWalletConnect({ chainId: 416002 }));
        })
        .catch(err => {
          console.error('Failed to initialize PeraWalletConnect', err);
        });
    }
  }, []);

  const getSolanaProvider = useCallback((preferred?: WalletType): InjectedSolanaProvider | null => {
    if (typeof window === 'undefined') return null;
    if (preferred === 'solflare' && window.solflare) return window.solflare;
    if (preferred === 'backpack' && window.backpack?.solana) return window.backpack.solana;
    if (preferred === 'phantom-solana' && window.phantom?.solana) return window.phantom.solana;
    return window.phantom?.solana || window.solana || window.solflare || window.backpack?.solana || null;
  }, []);

  const getActiveSolanaProvider = useCallback((): InjectedSolanaProvider | null => {
    return getSolanaProvider(state.walletType);
  }, [getSolanaProvider, state.walletType]);

  const getProvider = useCallback((preferred?: WalletType): InjectedEthereumProvider | null => {
    if (typeof window === 'undefined') return null;

    if (preferred === 'walletconnect') {
      const win = window as unknown as { walletconnectProvider?: InjectedEthereumProvider };
      if (win.walletconnectProvider) return win.walletconnectProvider;
    }

    const eth = window.ethereum as InjectedEthereumProvider | undefined;
    if (!eth) return null;

    const providers: InjectedEthereumProvider[] = Array.isArray(eth.providers) ? eth.providers : [eth];
    const candidates = providers.filter((p) => !p?.isTalisman);

    const pick = (predicate: (p: InjectedEthereumProvider) => boolean) => candidates.find(predicate) || null;

    if (preferred === 'phantom') {
      const phantom = window.phantom?.ethereum || (eth.isPhantom ? eth : null);
      if (phantom) return phantom;
      return pick((p) => !!p?.isPhantom);
    }
    if (preferred === 'metamask') return pick((p) => !!p?.isMetaMask && !p?.isPhantom && !p?.isExodus) || candidates[0] || null;
    if (preferred === 'coinbase') return pick((p) => !!p?.isCoinbaseWallet) || candidates[0] || null;

    return candidates[0] || (providers[0] || null);
  }, []);

  const getActiveEvmProvider = useCallback((): InjectedEthereumProvider | null => {
    return getProvider(state.walletType);
  }, [getProvider, state.walletType]);

  const setNetwork = useCallback((network: SupportedNetworkId) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(NETWORK_STORAGE_KEY, network);
    }
    setState((prev: WalletState) => {
      if (prev.network === network) return prev;
      const bothSolana =
        (prev.network === 'solana' || prev.network === 'seeker') &&
        (network === 'solana' || network === 'seeker');
      const hw = typeof window !== 'undefined' ? detectSeekerHardwareEnvironment() : { detected: false, reason: '' };
      const verified = prev.seekerVerified || hw.detected;
      const seekerReason = verified
        ? hw.detected
          ? hw.reason
          : prev.seekerVerificationReason
        : network === 'seeker'
          ? 'Seeker Theme Preview (Connect Seeker Phone or Genesis Token to unlock 0.25% · £5 Max Cap)'
          : 'Standard Solana Web Mode (0.50% · £50 Max Cap)';

      if (bothSolana && prev.isConnected) {
        if (typeof window !== 'undefined' && prev.address) {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ type: prev.walletType, address: prev.address, network })
          );
        }
        return {
          ...prev,
          network,
          seekerVerified: verified,
          seekerVerificationReason: seekerReason,
          seekerFeeBps: verified ? 25 : 50,
          seekerMaxCapGbp: verified ? 5 : 50,
        };
      }

      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
      return {
        ...prev,
        network,
        seekerVerified: hw.detected,
        seekerVerificationReason: seekerReason,
        seekerFeeBps: hw.detected ? 25 : 50,
        seekerMaxCapGbp: hw.detected ? 5 : 50,
        address: null,
        isConnected: false,
        walletType: null,
        chainId: null,
        isWrongNetwork: false,
        usdcBalance: '0.00',
        eurcBalance: '0.00',
      };
    });
  }, []);

  const toggleSeekerMode = useCallback(() => {
    setNetwork(state.network === 'seeker' ? 'solana' : 'seeker');
  }, [setNetwork, state.network]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.network = state.network;
    document.documentElement.dataset.network = state.network;
  }, [state.network]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message ? String(event.reason.message) : String(event.reason);
      if (msg.includes('Talisman extension has not been configured yet')) {
        event.preventDefault();
      }
    };

    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  const fetchSolanaBalances = useCallback(async (address: string) => {
    if (!isValidSolanaAddress(address)) return;
    try {
      const queryMintBalance = async (mint: string): Promise<string> => {
        const res = await fetch(ACTIVE_SOLANA_NETWORK.rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTokenAccountsByOwner',
            params: [address, { mint }, { encoding: 'jsonParsed' }],
          }),
        });
        if (!res.ok) return '0.00';
        const data = (await res.json()) as {
          result?: {
            value?: Array<{
              account?: {
                data?: {
                  parsed?: {
                    info?: {
                      tokenAmount?: { uiAmountString?: string; amount?: string };
                    };
                  };
                };
              };
            }>;
          };
        };
        const list = data?.result?.value || [];
        let sumUnits = BigInt(0);
        for (const item of list) {
          const amt = item.account?.data?.parsed?.info?.tokenAmount?.amount;
          if (amt) sumUnits += BigInt(amt);
        }
        const whole = sumUnits / BigInt(1_000_000);
        const frac = ((sumUnits % BigInt(1_000_000)) / BigInt(10_000)).toString().padStart(2, '0');
        return `${whole}.${frac}`;
      };

      const [usdc, eurc, hasSgt] = await Promise.all([
        queryMintBalance(SOLANA_MINTS.USDC),
        queryMintBalance(SOLANA_MINTS.EURC),
        checkSeekerGenesisTokenOnChain(address, ACTIVE_SOLANA_NETWORK.rpcUrl),
      ]);

      const hw = detectSeekerHardwareEnvironment();
      setState((prev: WalletState) => {
        const verified = hw.detected || hasSgt;
        const reason = hasSgt
          ? 'Seeker Genesis Token Verified On-Chain (0.25% · £5 Max Cap)'
          : hw.detected
            ? hw.reason
            : prev.network === 'seeker'
              ? 'Seeker Theme Preview (Standard Web Wallet · 0.50% · £50 Max Cap)'
              : 'Standard Solana Web Mode (0.50% · £50 Max Cap)';
        return {
          ...prev,
          usdcBalance: usdc,
          eurcBalance: eurc,
          seekerVerified: verified,
          seekerVerificationReason: reason,
          seekerFeeBps: verified ? 25 : 50,
          seekerMaxCapGbp: verified ? 5 : 50,
        };
      });
    } catch {
      // ignore RPC failures in offline/dev environments
    }
  }, []);

  const fetchAlgoBalances = useCallback(async (address: string) => {
    try {
      const res = await fetch(`https://testnet-api.algonode.cloud/v2/accounts/${address}`);
      if (!res.ok) return;
      interface AlgoAssetHolding {
        'asset-id': number;
        amount: number;
      }
      interface AlgoAccountResponse {
        assets?: AlgoAssetHolding[];
      }
      const data = (await res.json()) as AlgoAccountResponse;

      const usdcAsset = data.assets?.find(a => a['asset-id'] === 10458941);
      const usdc = usdcAsset ? (usdcAsset.amount / 1000000).toFixed(2) : '0.00';
      const eurcAsset = data.assets?.find(a => a['asset-id'] === 230190169);
      const eurc = eurcAsset ? (eurcAsset.amount / 1000000).toFixed(2) : '0.00';

      setState((prev: WalletState) => ({
        ...prev,
        usdcBalance: usdc,
        eurcBalance: eurc,
      }));
    } catch (err) {
      console.error('Failed to fetch Algorand balances', err);
    }
  }, []);

  const fetchBalances = useCallback(async (address: string, provider: InjectedEthereumProvider) => {
    try {
      const balanceOfSig = '0x70a08231' + address.slice(2).padStart(64, '0');

      const callToken = async (tokenAddress: string) => {
        const result = await provider.request({
          method: 'eth_call',
          params: [{ to: tokenAddress, data: balanceOfSig }, 'latest'],
        });
        if (typeof result === 'string' && result !== '0x' && result.startsWith('0x')) {
          const raw = BigInt(result);
          const divisor = BigInt(1_000_000);
          const whole = raw / divisor;
          const fraction = (raw % divisor).toString().padStart(6, '0').replace(/0+$/, '') || '00';
          return `${whole}.${fraction.slice(0, 2)}`;
        }
        return '0.00';
      };

      const [usdc, eurc] = await Promise.all([
        callToken(CURRENCY_CONFIG.USDC.address),
        callToken(CURRENCY_CONFIG.EURC.address),
      ]);

      setState((prev: WalletState) => ({ ...prev, usdcBalance: usdc, eurcBalance: eurc }));
    } catch {
      // ignore
    }
  }, []);

  const connect = useCallback(async (type: WalletType) => {
    setState((prev: WalletState) => ({ ...prev, isConnecting: true, error: null }));
    try {
      if (type === 'seeker' || type === 'phantom-solana' || type === 'solflare' || type === 'backpack') {
        const solProvider = getSolanaProvider(type);
        if (!solProvider) {
          if (type === 'seeker') {
            throw new Error(
              'Solana Seeker Seed Vault (MWA 2.0) or Solana wallet provider not detected in this browser. Open Pactopus on your Solana Seeker phone or install Phantom / Solflare.'
            );
          }
          if (type === 'solflare') {
            window.open('https://solflare.com/', '_blank');
            throw new Error('Solflare wallet not detected. Please install Solflare from solflare.com');
          }
          if (type === 'backpack') {
            window.open('https://backpack.app/', '_blank');
            throw new Error('Backpack wallet not detected. Please install Backpack from backpack.app');
          }
          window.open('https://phantom.app/', '_blank');
          throw new Error('Phantom Solana wallet not detected. Please install Phantom from phantom.app');
        }

        const resp = await solProvider.connect();
        const pubkeyObj = resp?.publicKey || solProvider.publicKey;
        const address = pubkeyObj?.toBase58 ? pubkeyObj.toBase58() : pubkeyObj?.toString() || '';
        if (!address || !isValidSolanaAddress(address)) {
          throw new Error('Connected Solana wallet did not return a valid Base58 public key.');
        }

        const hw = detectSeekerHardwareEnvironment();
        const providerIsSeeker = Boolean(solProvider.isSeeker || solProvider.isSeedVault || solProvider.isMobileWalletAdapter);
        const isHardwareVerified = hw.detected || providerIsSeeker;
        const targetNetwork: SupportedNetworkId = (type === 'seeker' || isHardwareVerified || state.network === 'seeker') ? 'seeker' : 'solana';

        if (typeof window !== 'undefined') {
          localStorage.setItem(NETWORK_STORAGE_KEY, targetNetwork);
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ type, address, network: targetNetwork }));
        }

        setState((prev: WalletState) => ({
          ...prev,
          address,
          isConnected: true,
          isConnecting: false,
          walletType: type,
          network: targetNetwork,
          seekerVerified: isHardwareVerified,
          seekerVerificationReason: isHardwareVerified
            ? hw.reason
            : 'Checking on-chain Seeker Genesis Token…',
          seekerFeeBps: isHardwareVerified ? 25 : 50,
          seekerMaxCapGbp: isHardwareVerified ? 5 : 50,
          isWrongNetwork: false,
          error: null,
        }));

        recordMilestone('first_wallet_connect');
        await fetchSolanaBalances(address);
        return;
      }

      if (type === 'pera') {
        if (!peraWallet) throw new Error('Pera Wallet provider not initialized');
        const accounts = await peraWallet.connect();

        peraWallet.connector?.on('disconnect', () => {
          if (typeof window !== 'undefined') {
            localStorage.removeItem(STORAGE_KEY);
          }
          setState((prev: WalletState) => ({
            ...prev,
            address: null,
            isConnected: false,
            isConnecting: false,
            walletType: null,
            chainId: null,
            isWrongNetwork: false,
            usdcBalance: '0.00',
            eurcBalance: '0.00',
            error: null,
          }));
        });

        const address = accounts[0];
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ type, address, network: 'algorand' }));
        }

        setState((prev: WalletState) => ({
          ...prev,
          address,
          isConnected: true,
          isConnecting: false,
          walletType: type,
          network: 'algorand',
          error: null,
        }));

        recordMilestone('first_wallet_connect');
        await fetchAlgoBalances(address);
      } else {
        // EVM / Arc logic
        let provider: InjectedEthereumProvider | null = null;

        if (type === 'walletconnect') {
          const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
          if (!projectId) {
            throw new Error('WalletConnect is not configured. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local and restart the dev server.');
          }
          const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
          const wcProvider = await EthereumProvider.init({
            projectId,
            chains: [ARC_CHAIN.id],
            showQrModal: true,
            rpcMap: {
              [ARC_CHAIN.id]: ARC_CHAIN.rpcUrls.default.http[0]
            }
          });
          await wcProvider.connect();
          provider = wcProvider as unknown as InjectedEthereumProvider;
          (window as unknown as { walletconnectProvider?: InjectedEthereumProvider }).walletconnectProvider = provider;
        } else {
          provider = getProvider(type);
          if (!provider) {
            if (type === 'phantom') {
              window.open('https://phantom.app/', '_blank');
              throw new Error('Phantom wallet not detected. Please install Phantom from phantom.app');
            }
            if (type === 'coinbase') {
              window.open('https://www.coinbase.com/wallet', '_blank');
              throw new Error('Coinbase Wallet not detected.');
            }
            if (type === 'metamask') {
              window.open('https://metamask.io/download/', '_blank');
              throw new Error('MetaMask not installed. Please install it and refresh.');
            }
            throw new Error('No browser wallet detected. Please install a Web3 wallet.');
          }
        }

        const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
        if (!accounts.length) throw new Error('No accounts found');

        const address = accounts[0].toLowerCase();
        const chainIdHex = (await provider.request({ method: 'eth_chainId' })) as string;
        const chainId = parseInt(chainIdHex, 16);

        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ type, address, network: 'arc' }));
        }

        setState((prev: WalletState) => ({
          ...prev,
          address,
          isConnected: true,
          isConnecting: false,
          walletType: type,
          chainId,
          isWrongNetwork: chainId !== ARC_CHAIN.id,
          network: 'arc',
          error: null,
        }));

        recordMilestone('first_wallet_connect');
        await fetchBalances(address, provider);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setState((prev: WalletState) => ({
        ...prev,
        isConnecting: false,
        error: errMsg || 'Failed to connect wallet',
      }));
    }
  }, [getProvider, getSolanaProvider, fetchBalances, fetchAlgoBalances, fetchSolanaBalances, peraWallet, state.network]);

  const disconnect = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    if (state.walletType === 'pera' && peraWallet) {
      peraWallet.disconnect().catch(() => {});
    }
    const solProvider = getSolanaProvider(state.walletType);
    if (solProvider?.disconnect) {
      solProvider.disconnect().catch(() => {});
    }
    setState((prev: WalletState) => ({
      ...prev,
      address: null,
      isConnected: false,
      isConnecting: false,
      walletType: null,
      chainId: null,
      isWrongNetwork: false,
      usdcBalance: '0.00',
      eurcBalance: '0.00',
      error: null,
    }));
  }, [state.walletType, peraWallet, getSolanaProvider]);

  const switchNetwork = useCallback(async () => {
    if (state.network !== 'arc') return;
    const provider = getProvider(state.walletType);
    if (!provider) return;
    try {
      await switchToArc(provider);
      setState((prev: WalletState) => ({ ...prev, isWrongNetwork: false, chainId: ARC_CHAIN.id }));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setState((prev: WalletState) => ({ ...prev, error: errMsg }));
    }
  }, [getProvider, state.network, state.walletType]);

  const refreshBalances = useCallback(async () => {
    if (state.network === 'solana' || state.network === 'seeker') {
      if (state.address) await fetchSolanaBalances(state.address);
    } else if (state.network === 'algorand') {
      if (state.address) await fetchAlgoBalances(state.address);
    } else {
      const provider = getProvider(state.walletType);
      if (!provider || !state.address) return;
      await fetchBalances(state.address, provider);
    }
  }, [getProvider, state.address, state.network, state.walletType, fetchBalances, fetchAlgoBalances, fetchSolanaBalances]);

  // Auto-reconnect on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { type, network } = JSON.parse(saved);
        const validTypes: WalletType[] = [
          'seeker',
          'phantom-solana',
          'solflare',
          'backpack',
          'metamask',
          'phantom',
          'coinbase',
          'walletconnect',
          'pera',
        ];
        if (!validTypes.includes(type)) {
          localStorage.removeItem(STORAGE_KEY);
          return;
        }
        if (network === 'algorand') {
          if (type === 'pera' && peraWallet) {
            peraWallet.reconnectSession().then((accounts: string[]) => {
              if (accounts && accounts.length) {
                setState((prev: WalletState) => ({
                  ...prev,
                  address: accounts[0],
                  isConnected: true,
                  walletType: 'pera',
                  network: 'algorand',
                }));
                fetchAlgoBalances(accounts[0]);
              }
            }).catch(() => {});
          }
        } else {
          setTimeout(() => {
            connect(type).catch(() => {});
          }, 0);
        }
      } catch { /* ignore */ }
    }
  }, [connect, peraWallet, fetchAlgoBalances]);

  const signMessage = useCallback(async (message: string): Promise<string> => {
    if (state.network === 'solana' || state.network === 'seeker') {
      const solProvider = getSolanaProvider(state.walletType);
      if (!solProvider || !solProvider.signMessage || !state.address) {
        throw new Error('Solana wallet (Seed Vault / Phantom / Solflare) must be connected before signing.');
      }
      const encoded = new TextEncoder().encode(message);
      const signedResult = await solProvider.signMessage(encoded, 'utf8');
      const sigBytes = signedResult instanceof Uint8Array ? signedResult : signedResult?.signature;
      if (!sigBytes || sigBytes.length !== 64) {
        throw new Error('Solana wallet returned an invalid Ed25519 signature.');
      }
      return btoa(Array.from(sigBytes, (b) => String.fromCharCode(b)).join(''));
    }

    if (state.network === 'algorand') {
      if (state.walletType !== 'pera' || !peraWallet || !state.address || !algosdk.isValidAddress(state.address)) {
        throw new Error('Algorand authenticated writes require a connected Pera Wallet.');
      }
      const signed: Uint8Array[] = await peraWallet.signData(
        [{ data: new TextEncoder().encode(message), message: 'Authorize this Pactopus request' }],
        state.address,
        true
      );
      if (!signed[0] || signed[0].length !== 64) throw new Error('Pera returned no valid data signature.');
      return btoa(Array.from(signed[0], byte => String.fromCharCode(byte)).join(''));
    }

    if (!state.address) {
      throw new Error('Wallet must be connected before signing.');
    }
    const provider = getProvider(state.walletType);
    if (!provider || typeof provider.request !== 'function') {
      throw new Error('Wallet provider is not available for signing.');
    }
    const sig: unknown = await provider.request({
      method: 'personal_sign',
      params: [message, state.address],
    });
    if (typeof sig !== 'string' || !/^0x[a-fA-F0-9]+$/.test(sig)) {
      throw new Error('Wallet returned a malformed signature.');
    }
    return sig;
  }, [getProvider, getSolanaProvider, state.network, state.walletType, state.address, peraWallet]);

  const signAndSendSolanaTransaction = useCallback(async (transactionBase64: string): Promise<string> => {
    const solProvider = getSolanaProvider(state.walletType);
    if (!solProvider || !state.address) {
      throw new Error('Connect your Solana Seeker, Phantom, Solflare, or Backpack wallet to sign this transaction.');
    }

    // 1. Try Phantom / Solflare / MWA JSON-RPC `request({ method: 'signAndSendTransaction', params: { message } })`
    const rawBytes = Uint8Array.from(atob(transactionBase64), (c) => c.charCodeAt(0));
    const base58Tx = encodeBase58(rawBytes);

    if (typeof solProvider.request === 'function') {
      try {
        const res = await solProvider.request({
          method: 'signAndSendTransaction',
          params: { message: base58Tx },
        });
        const sig = typeof res === 'string' ? res : res?.signature;
        if (sig && isValidSolanaSignature(sig)) {
          return sig;
        }
      } catch (err) {
        const code = err && typeof err === 'object' && 'code' in err ? (err as { code: number }).code : 0;
        if (code === 4001) throw err;
        // Fall through to signAndSendTransaction / signTransaction + sendTransaction RPC
      }
    }

    // 2. Try provider.signAndSendTransaction({ serialize: () => rawBytes })
    if (typeof solProvider.signAndSendTransaction === 'function') {
      const txLike = {
        serialize: () => rawBytes,
        serializeMessage: () => rawBytes.subarray(65),
      };
      const result = await solProvider.signAndSendTransaction(txLike);
      const sig = typeof result === 'string' ? result : result?.signature;
      if (sig && isValidSolanaSignature(sig)) {
        return sig;
      }
    }

    // 3. Try provider.signTransaction + broadcast via Solana JSON-RPC `sendTransaction`
    if (typeof solProvider.signTransaction === 'function') {
      const txLike = {
        serialize: () => rawBytes,
        serializeMessage: () => rawBytes.subarray(65),
      };
      const signed = await solProvider.signTransaction(txLike);
      const signedBytes =
        signed instanceof Uint8Array
          ? signed
          : typeof signed?.serialize === 'function'
            ? signed.serialize()
            : null;
      if (signedBytes && signedBytes.length > 64) {
        const signedBase64 = btoa(Array.from(signedBytes, (b) => String.fromCharCode(b)).join(''));
        const rpcRes = await fetch(ACTIVE_SOLANA_NETWORK.rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'sendTransaction',
            params: [signedBase64, { encoding: 'base64', preflightCommitment: 'confirmed' }],
          }),
        });
        const rpcData = (await rpcRes.json()) as { result?: string; error?: { message?: string } };
        if (rpcData.result && isValidSolanaSignature(rpcData.result)) {
          return rpcData.result;
        }
        if (rpcData.error?.message) {
          throw new Error(rpcData.error.message);
        }
      }
    }

    throw new Error(
      'Your wallet requires scanning the Solana Pay QR code below or approving via Solana Mobile Wallet Adapter.'
    );
  }, [getSolanaProvider, state.walletType, state.address]);

  const signAlgorandGroup = useCallback(async (transactions: algosdk.Transaction[], onSigned?: (txid: string) => void): Promise<string> => {
    if (state.network !== 'algorand' || state.walletType !== 'pera' || !peraWallet || !state.address) {
      throw new Error('Connect Pera Wallet on Algorand Testnet to pay this invoice.');
    }
    const signed: Uint8Array[] = await peraWallet.signTransaction([transactions.map(txn => ({ txn }))], state.address);
    if (signed.length !== transactions.length || signed.some(blob => !blob?.length)) {
      throw new Error('Pera did not sign every transaction in the payment group.');
    }
    for (let i = 0; i < signed.length; i++) {
      const decoded = algosdk.decodeSignedTransaction(signed[i]);
      if (decoded.txn.txID() !== transactions[i].txID() || !decoded.sig) throw new Error('Wallet signed a different payment transaction.');
    }
    const txid = transactions[0].txID();
    onSigned?.(txid);
    const algod = new algosdk.Algodv2('', ACTIVE_ALGO_NETWORK.algodUrl, '');
    const sent = await algod.sendRawTransaction(signed).do();
    if (String(sent.txid) !== txid) throw new Error('Broadcast returned an unexpected transaction ID.');
    return txid;
  }, [state.network, state.walletType, state.address, peraWallet]);

  return (
    <WalletContext.Provider
      value={{
        ...state,
        connect,
        disconnect,
        switchNetwork,
        refreshBalances,
        setNetwork,
        toggleSeekerMode,
        getActiveEvmProvider,
        getActiveSolanaProvider,
        signMessage,
        signAndSendSolanaTransaction,
        signAlgorandGroup,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

export function useOptionalWallet() {
  return useContext(WalletContext);
}
