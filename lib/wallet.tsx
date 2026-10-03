// Wallet connection context — MetaMask, Coinbase, WalletConnect, Pera Wallet, MyAlgo
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
  | 'exodus'
  | 'walletconnect'
  | 'passkey'
  | 'pera'
  | 'defly'
  | 'myalgo'
  | 'passkey_algo'
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

interface WalletContextType extends WalletState {
  connect: (type: WalletType) => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  setNetwork: (network: 'arc' | 'algorand') => void;
  /** Sign the request with EVM personal_sign or Pera Algorand signData. */
  signMessage: (message: string) => Promise<string>;
  signAlgorandGroup: (transactions: algosdk.Transaction[], onSigned?: (txid: string) => void) => Promise<string>;
}

const WalletContext = createContext<WalletContextType | null>(null);
const STORAGE_KEY = 'pactopus_wallet';

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    address: null,
    isConnected: false,
    isConnecting: false,
    walletType: null,
    chainId: null,
    isWrongNetwork: false,
    usdcBalance: '0.00',
    eurcBalance: '0.00',
    error: null,
    network: 'arc',
  });

  const [peraWallet, setPeraWallet] = useState<any>(null);

  // Initialize Pera Wallet client-side to prevent SSR issues
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

  const getProvider = useCallback((preferred?: WalletType) => {
    if (typeof window === 'undefined') return null;
    const eth = window.ethereum;
    if (!eth) return null;

    const providers = Array.isArray((eth as any).providers) ? (eth as any).providers : [eth];
    const candidates = providers.filter((p: any) => !p?.isTalisman);

    const pick = (predicate: (p: any) => boolean) => candidates.find(predicate) || null;

    if (preferred === 'exodus') {
      const exo = (window as any).exodus?.ethereum || ((eth as any).isExodus ? eth : null);
      if (exo) return exo;
      return pick((p: any) => !!p?.isExodus) || null;
    }
    if (preferred === 'phantom') {
      const phantom = (window as any).phantom?.ethereum || ((eth as any).isPhantom ? eth : null);
      if (phantom) return phantom;
      return pick((p: any) => !!p?.isPhantom) || null;
    }
    if (preferred === 'metamask') return pick((p: any) => !!p?.isMetaMask && !p?.isPhantom && !p?.isExodus) || candidates[0] || null;
    if (preferred === 'coinbase') return pick((p: any) => !!p?.isCoinbaseWallet) || candidates[0] || null;

    return candidates[0] || (providers[0] || null);
  }, []);

  const setNetwork = useCallback((network: 'arc' | 'algorand') => {
    setState(prev => {
      if (prev.network === network) return prev;
      // When switching networks, disconnect the active session to prevent mixed state
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

    // Flip CSS variables instantly so Pactopus can mirror the active chain's brand colors.
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
      const data = await res.json();
      
      // USDC Asset ID: 10458941, EURC Asset ID: 230190169
      const usdcAsset = data.assets?.find((a: any) => a['asset-id'] === 10458941);
      const usdc = usdcAsset ? (usdcAsset.amount / 1000000).toFixed(2) : '0.00';
      const eurcAsset = data.assets?.find((a: any) => a['asset-id'] === 230190169);
      const eurc = eurcAsset ? (eurcAsset.amount / 1000000).toFixed(2) : '0.00';

      setState(prev => ({
        ...prev,
        usdcBalance: usdc,
        eurcBalance: eurc,
      }));
    } catch (err) {
      console.error('Failed to fetch Algorand balances', err);
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchBalances = useCallback(async (address: string, provider: any) => {
    try {
      const balanceOfSig = '0x70a08231' + address.slice(2).padStart(64, '0');

      const callToken = async (tokenAddress: string) => {
        const result = await provider.request({
          method: 'eth_call',
          params: [{ to: tokenAddress, data: balanceOfSig }, 'latest'],
        });
        if (result && result !== '0x') {
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

      setState(prev => ({ ...prev, usdcBalance: usdc, eurcBalance: eurc }));
    } catch {
      // ignore
    }
  }, []);

  const connect = useCallback(async (type: WalletType) => {
    setState(prev => ({ ...prev, isConnecting: true, error: null }));
    try {
      if (type === 'passkey') {
        // Biometric WebAuthn Passkey (Face ID / Touch ID / Windows Hello)
        if (typeof window === 'undefined' || !window.PublicKeyCredential) {
          throw new Error('Passkeys are not supported on this browser/device.');
        }

        let credId = localStorage.getItem('pactopus_passkey_evm_id');
        let address = '';

        if (!credId) {
          const challenge = new Uint8Array(32);
          window.crypto.getRandomValues(challenge);
          const userId = new Uint8Array(16);
          window.crypto.getRandomValues(userId);

          const credential = (await navigator.credentials.create({
            publicKey: {
              challenge,
              rp: { name: 'Pactopus Network', id: window.location.hostname },
              user: {
                id: userId,
                name: 'pactopus-user@passkey',
                displayName: 'Pactopus Sovereign Passkey',
              },
              pubKeyCredParams: [
                { alg: -7, type: 'public-key' },
                { alg: -257, type: 'public-key' },
              ],
              authenticatorSelection: {
                userVerification: 'preferred',
                residentKey: 'preferred',
              },
              timeout: 60000,
            },
          })) as any;

          if (!credential) throw new Error('Passkey creation was cancelled.');
          
          const rawHash = await crypto.subtle.digest('SHA-256', credential.rawId);
          const hashHex = Array.from(new Uint8Array(rawHash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          address = ('0x' + hashHex.slice(0, 40)).toLowerCase();
          localStorage.setItem('pactopus_passkey_evm_id', address);
        } else {
          address = credId;
        }

        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ type, address, network: 'arc' }));
        }

        setState(prev => ({
          ...prev,
          address,
          isConnected: true,
          isConnecting: false,
          walletType: type,
          chainId: ARC_CHAIN.id,
          isWrongNetwork: false,
          network: 'arc',
          error: null,
        }));

        recordMilestone('first_wallet_connect');
        return;
      } else if (type === 'passkey_algo') {
        // Biometric WebAuthn Passkey for Algorand
        if (typeof window === 'undefined' || !window.PublicKeyCredential) {
          throw new Error('Passkeys are not supported on this browser/device.');
        }

        let savedAlgoAddr = localStorage.getItem('pactopus_passkey_algo_addr');
        let address = '';

        if (!savedAlgoAddr) {
          const challenge = new Uint8Array(32);
          window.crypto.getRandomValues(challenge);
          const userId = new Uint8Array(16);
          window.crypto.getRandomValues(userId);

          const credential = (await navigator.credentials.create({
            publicKey: {
              challenge,
              rp: { name: 'Pactopus Network', id: window.location.hostname },
              user: {
                id: userId,
                name: 'pactopus-algo@passkey',
                displayName: 'Pactopus Algorand Passkey',
              },
              pubKeyCredParams: [
                { alg: -7, type: 'public-key' },
                { alg: -257, type: 'public-key' },
              ],
              authenticatorSelection: {
                userVerification: 'preferred',
                residentKey: 'preferred',
              },
              timeout: 60000,
            },
          })) as any;

          if (!credential) throw new Error('Passkey creation was cancelled.');

          const rawHash = await crypto.subtle.digest('SHA-256', credential.rawId);
          const hashBytes = Array.from(new Uint8Array(rawHash));
          const algoChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
          address = Array.from({ length: 58 }, (_, i) => algoChars[hashBytes[i % hashBytes.length] % 32]).join('');
          localStorage.setItem('pactopus_passkey_algo_addr', address);
        } else {
          address = savedAlgoAddr;
        }

        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ type, address, network: 'algorand' }));
        }

        setState(prev => ({
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
        return;
      } else if (type === 'exodus' && state.network === 'algorand') {
        const exoAlgo = (window as any).exodus?.algorand || (window as any).algorand || (window as any).algo;
        if (!exoAlgo) {
          window.open('https://www.exodus.com/web3-wallet/', '_blank');
          throw new Error('Exodus Browser Wallet not detected. Please install Exodus from exodus.com/web3-wallet/');
        }
        const accounts = await exoAlgo.enable();
        if (!accounts || !accounts.length) throw new Error('No Exodus accounts found');
        const address = typeof accounts[0] === 'string' ? accounts[0] : accounts[0].address;

        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ type, address, network: 'algorand' }));
        }

        setState(prev => ({
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
      } else if (type === 'defly') {
        const defly = (window as any).defly || (window as any).algorand || (window as any).algo;
        if (!defly) {
          window.open('https://defly.app/', '_blank');
          throw new Error('Defly wallet not detected. Install Defly extension/app or use Pera Wallet.');
        }
        const accounts = await defly.enable();
        if (!accounts || !accounts.length) throw new Error('No Defly accounts found');
        const address = typeof accounts[0] === 'string' ? accounts[0] : accounts[0].address;

        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ type, address, network: 'algorand' }));
        }

        setState(prev => ({
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
      } else if (type === 'pera') {
        if (!peraWallet) throw new Error('Pera Wallet provider not initialized');
        const accounts = await peraWallet.connect();
        
        peraWallet.connector?.on('disconnect', () => {
          if (typeof window !== 'undefined') {
            localStorage.removeItem(STORAGE_KEY);
          }
          setState(prev => ({
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

        setState(prev => ({
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
      } else if (type === 'myalgo') {
        const algo = (window as any).algorand || (window as any).algo;
        if (!algo) {
          throw new Error('Algorand Wallet extension (Pera or Kibisis) not detected. Please install it.');
        }
        const accounts = await algo.enable();
        if (!accounts || !accounts.length) throw new Error('No accounts found');
        const address = typeof accounts[0] === 'string' ? accounts[0] : accounts[0].address;

        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ type, address, network: 'algorand' }));
        }

        setState(prev => ({
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let provider: any = null;

        if (type === 'walletconnect') {
          const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
          if (!projectId) {
            throw new Error('WalletConnect is not configured. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local and restart the dev server.');
          }
          const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
          provider = await EthereumProvider.init({
            projectId,
            chains: [ARC_CHAIN.id],
            showQrModal: true,
            rpcMap: {
              [ARC_CHAIN.id]: ARC_CHAIN.rpcUrls.default.http[0]
            }
          });
          await provider.connect();
        } else {
          provider = getProvider(type);
          if (!provider) {
            if (type === 'exodus') {
              window.open('https://www.exodus.com/web3-wallet/', '_blank');
              throw new Error('Exodus Browser Wallet not detected. Please install Exodus from exodus.com/web3-wallet/');
            }
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

        const accounts: string[] = await provider.request({ method: 'eth_requestAccounts' });
        if (!accounts.length) throw new Error('No accounts found');

        const address = accounts[0].toLowerCase();
        const chainIdHex: string = await provider.request({ method: 'eth_chainId' });
        const chainId = parseInt(chainIdHex, 16);

        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ type, address, network: 'arc' }));
        }

        setState(prev => ({
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
      setState(prev => ({
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
    setState(prev => ({
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
    if (state.network === 'algorand') return; // Algorand doesn't use EVM chain switching
    const provider = getProvider(state.walletType);
    if (!provider) return;
    try {
      await switchToArc(provider);
      setState(prev => ({ ...prev, isWrongNetwork: false, chainId: ARC_CHAIN.id }));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setState(prev => ({ ...prev, error: errMsg }));
    }
  }, [getProvider, state.network]);

  const refreshBalances = useCallback(async () => {
    if (state.network === 'algorand') {
      if (state.address) await fetchAlgoBalances(state.address);
    } else {
      const provider = getProvider(state.walletType);
      if (!provider || !state.address) return;
      await fetchBalances(state.address, provider);
    }
  }, [getProvider, state.address, state.network, fetchBalances, fetchAlgoBalances]);

  // Auto-reconnect on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const { type, network } = JSON.parse(saved);
        if (network === 'algorand') {
          if (type === 'pera' && peraWallet) {
            peraWallet.reconnectSession().then((accounts: string[]) => {
              if (accounts && accounts.length) {
                setState(prev => ({
                  ...prev,
                  address: accounts[0],
                  isConnected: true,
                  walletType: 'pera',
                  network: 'algorand',
                }));
                fetchAlgoBalances(accounts[0]);
              }
            }).catch(() => {});
          } else if (type === 'myalgo') {
            const algo = (window as any).algorand || (window as any).algo;
            if (algo) {
              algo.enable().then((accounts: any[]) => {
                if (accounts && accounts.length) {
                  const addr = typeof accounts[0] === 'string' ? accounts[0] : accounts[0].address;
                  setState(prev => ({
                    ...prev,
                    address: addr,
                    isConnected: true,
                    walletType: 'myalgo',
                    network: 'algorand',
                  }));
                  fetchAlgoBalances(addr);
                }
              }).catch(() => {});
            }
          }
        } else {
          // EVM Reconnect
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

    const onAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        setState(prev => ({ ...prev, address: accounts[0].toLowerCase() }));
      }
    };
    const onChainChanged = (chainIdHex: string) => {
      const chainId = parseInt(chainIdHex, 16);
      setState(prev => ({ ...prev, chainId, isWrongNetwork: chainId !== ARC_CHAIN.id }));
    };

    provider.on?.('accountsChanged', onAccountsChanged);
    provider.on?.('chainChanged', onChainChanged);

    return () => {
      provider.removeListener?.('accountsChanged', onAccountsChanged);
      provider.removeListener?.('chainChanged', onChainChanged);
    };
  }, [getProvider, disconnect, state.network]);

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
    // Arc/EVM — personal_sign. MetaMask, Coinbase, Phantom, Rabby, Exodus, WalletConnect
    // all implement this method per EIP-191; the provider returned by getProvider() is
    // an EIP-1193 object so we cast to unknown first to keep eslint strict.
    if (state.walletType === 'walletconnect') {
      try {
        const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
        if (projectId) {
          const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
          // WalletConnect is stateful — attach the signature to the default provider
          // if one has already been initialized via connect(). Fall through otherwise.
          const maybeProvider = (window as any).walletconnectProvider || null;
          if (maybeProvider && typeof maybeProvider.request === 'function') {
            const sig: string = await maybeProvider.request({
              method: 'personal_sign',
              params: [message, state.address],
            });
            return sig;
          }
        }
      } catch (_e) { /* fall through to default provider below */ }
    }
    const provider = getProvider(state.walletType);
    if (!provider || typeof (provider as any).request !== 'function') {
      throw new Error('Arc/EVM wallet provider is not available for signing. Install MetaMask or Coinbase Wallet and try again.');
    }
    const sig: unknown = await (provider as any).request({
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
    // Record the signed transaction IDs before broadcast. A network timeout may
    // happen after the node accepts a group; never ask the wallet to pay twice.
    onSigned?.(txid);
    const algod = new algosdk.Algodv2('', ACTIVE_ALGO_NETWORK.algodUrl, '');
    const sent = await algod.sendRawTransaction(signed).do();
    if (String(sent.txid) !== txid) throw new Error('Broadcast returned an unexpected transaction ID.');
    return txid;
  }, [state.network, state.walletType, state.address, peraWallet]);

  return (
    <WalletContext.Provider value={{ ...state, connect, disconnect, switchNetwork, refreshBalances, setNetwork, signMessage, signAlgorandGroup }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
