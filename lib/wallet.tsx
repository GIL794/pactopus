// Wallet connection context — MetaMask, Coinbase, Phantom, WalletConnect, Pera Wallet
'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ARC_CHAIN, switchToArc, CURRENCY_CONFIG } from '@/lib/arc';
import { recordMilestone } from '@/lib/milestones';
import algosdk from 'algosdk';
import { ACTIVE_ALGO_NETWORK } from '@/lib/algo';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethereum?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    algorand?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    algo?: any;
  }
}

export type WalletType =
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
  network: 'arc' | 'algorand';
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
  setNetwork: (network: 'arc' | 'algorand') => void;
  getActiveEvmProvider: () => InjectedEthereumProvider | null;
  /** Sign the request with EVM personal_sign or Pera Algorand signData. */
  signMessage: (message: string) => Promise<string>;
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

function detectInitialNetwork(): 'arc' | 'algorand' {
  if (typeof window === 'undefined') return 'arc';

  const savedPref = localStorage.getItem(NETWORK_STORAGE_KEY) as 'arc' | 'algorand' | null;
  if (savedPref === 'arc' || savedPref === 'algorand') return savedPref;

  const savedSession = localStorage.getItem(STORAGE_KEY);
  if (savedSession) {
    try {
      const { network } = JSON.parse(savedSession);
      if (network === 'arc' || network === 'algorand') return network;
    } catch { /* ignore */ }
  }

  return 'arc';
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>(() => ({
    address: null,
    isConnected: false,
    isConnecting: false,
    walletType: null,
    chainId: null,
    isWrongNetwork: false,
    usdcBalance: '0.00',
    eurcBalance: '0.00',
    error: null,
    network: detectInitialNetwork(),
  }));

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
      const win = window as unknown as { phantom?: { ethereum?: InjectedEthereumProvider } };
      const phantom = win.phantom?.ethereum || (eth.isPhantom ? eth : null);
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

  const setNetwork = useCallback((network: 'arc' | 'algorand') => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(NETWORK_STORAGE_KEY, network);
    }
    setState((prev: WalletState) => {
      if (prev.network === network) return prev;
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
      return {
        ...prev,
        network,
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

      // USDC Asset ID: 10458941, EURC Asset ID: 230190169
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
  }, [getProvider, fetchBalances, fetchAlgoBalances, peraWallet]);

  const disconnect = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    if (state.walletType === 'pera' && peraWallet) {
      peraWallet.disconnect().catch(() => {});
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
  }, [state.walletType, peraWallet]);

  const switchNetwork = useCallback(async () => {
    if (state.network === 'algorand') return;
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
    if (state.network === 'algorand') {
      if (state.address) await fetchAlgoBalances(state.address);
    } else {
      const provider = getProvider(state.walletType);
      if (!provider || !state.address) return;
      await fetchBalances(state.address, provider);
    }
  }, [getProvider, state.address, state.network, state.walletType, fetchBalances, fetchAlgoBalances]);

  // Auto-reconnect on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { type, network } = JSON.parse(saved);
        const validTypes: WalletType[] = ['metamask', 'phantom', 'coinbase', 'walletconnect', 'pera'];
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

  // Listen for EVM account/chain changes
  useEffect(() => {
    if (state.network === 'algorand') return;
    const provider = getProvider(state.walletType);
    if (!provider) return;

    const onAccountsChanged = (rawAccounts: unknown) => {
      const accounts = Array.isArray(rawAccounts) ? (rawAccounts as string[]) : [];
      if (accounts.length === 0) {
        disconnect();
      } else {
        setState((prev: WalletState) => ({ ...prev, address: String(accounts[0]).toLowerCase() }));
      }
    };
    const onChainChanged = (rawChainIdHex: unknown) => {
      const chainIdHex = typeof rawChainIdHex === 'string' ? rawChainIdHex : '';
      const chainId = parseInt(chainIdHex, 16);
      setState((prev: WalletState) => ({ ...prev, chainId, isWrongNetwork: chainId !== ARC_CHAIN.id }));
    };

    provider.on?.('accountsChanged', onAccountsChanged);
    provider.on?.('chainChanged', onChainChanged);

    return () => {
      provider.removeListener?.('accountsChanged', onAccountsChanged);
      provider.removeListener?.('chainChanged', onChainChanged);
    };
  }, [getProvider, disconnect, state.network, state.walletType]);

  const signMessage = useCallback(async (message: string): Promise<string> => {
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
      throw new Error('Arc/EVM wallet provider is not available for signing. Install MetaMask or Coinbase Wallet and try again.');
    }
    const sig: unknown = await provider.request({
      method: 'personal_sign',
      params: [message, state.address],
    });
    if (typeof sig !== 'string' || !/^0x[a-fA-F0-9]+$/.test(sig)) {
      throw new Error('Wallet returned a malformed signature.');
    }
    return sig;
  }, [getProvider, state.network, state.walletType, state.address, peraWallet]);

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
    <WalletContext.Provider value={{ ...state, connect, disconnect, switchNetwork, refreshBalances, setNetwork, getActiveEvmProvider, signMessage, signAlgorandGroup }}>
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
