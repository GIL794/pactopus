'use client';

import { useWallet, WalletType } from '@/lib/wallet';
import { useEffect, useRef } from 'react';

interface WalletModalProps {
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement>;
}

interface WalletOption {
  type: WalletType;
  name: string;
  description: string;
  icon: string;
  color: string;
  badge?: string;
  recommended: boolean;
}

const EVM_WALLETS: WalletOption[] = [
  {
    type: 'metamask' as WalletType,
    name: 'MetaMask',
    description: 'Most popular EVM wallet — 30M+ users',
    icon: '🦊',
    color: '#f6851b',
    recommended: true,
  },
  {
    type: 'coinbase' as WalletType,
    name: 'Coinbase Smart Wallet',
    description: 'Passkey-native smart account & extension',
    icon: '🔵',
    color: '#0052ff',
    badge: 'Passkey Ready',
    recommended: false,
  },
  {
    type: 'phantom' as WalletType,
    name: 'Phantom',
    description: 'Multi-chain EVM wallet extension',
    icon: '👻',
    color: '#ab9ff2',
    recommended: false,
  },
  ...(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
    ? [
        {
          type: 'walletconnect' as WalletType,
          name: 'WalletConnect',
          description: 'Any mobile wallet via QR code',
          icon: '🔗',
          color: '#3b99fc',
          recommended: false,
        },
      ]
    : []),
];

const ALGO_WALLETS: WalletOption[] = [
  {
    type: 'pera' as WalletType,
    name: 'Pera Wallet',
    description: 'Required for authenticated Algorand Testnet invoicing and grouped payment',
    icon: '📱',
    color: '#ffe500',
    recommended: true,
  },
];

export default function WalletModal({ onClose, triggerRef }: WalletModalProps) {
  const { connect, isConnecting, isConnected, error, network, setNetwork } = useWallet();

  const wallets = network === 'algorand' ? ALGO_WALLETS : EVM_WALLETS;
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isConnected) onClose();
  }, [isConnected, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!modalRef.current) return;
    const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
    );
    const first = focusable?.[0];
    first?.focus();
    const trigger = triggerRef?.current;
    return () => {
      trigger?.focus();
    };
  }, [triggerRef]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    if (!modalRef.current) return;
    const focusable = modalRef.current.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={modalRef}
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-modal-title"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{ overscrollBehavior: 'contain' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal" id="wallet-connect-modal">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <h2 id="wallet-modal-title" className="heading-lg" style={{ margin: 0 }}>Connect your {network === 'algorand' ? 'Algorand' : 'Arc (EVM)'} wallet</h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
              Choose a wallet to receive stablecoin payments in the Pactopus workspace tailored to this chain
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ color: 'var(--text-muted)', fontSize: '1.25rem', padding: '0.25rem', background: 'none', border: 'none', cursor: 'pointer' }}
            aria-label="Close wallet modal"
          >
            ✕
          </button>
        </div>

        {/* Workspace Switcher in Modal */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.625rem 0.875rem',
          marginBottom: '1.25rem',
          background: 'var(--field-bg)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          fontSize: '0.8125rem'
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            Active workspace: <strong style={{ color: network === 'algorand' ? 'var(--accent-cyan)' : 'var(--accent-gold)' }}>{network === 'algorand' ? '⚡ Algorand' : '🏛️ Arc L1'}</strong>
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setNetwork(network === 'algorand' ? 'arc' : 'algorand')}
            style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
          >
            Switch to {network === 'algorand' ? 'Arc (EVM)' : 'Algorand'} →
          </button>
        </div>

        {/* Wallet options */}
        {wallets.map(wallet => (
          <button
            key={wallet.type}
            className="wallet-option"
            onClick={() => connect(wallet.type)}
            disabled={isConnecting}
            id={`connect-${wallet.type}-btn`}
          >
            <span style={{ fontSize: '1.5rem' }}>{wallet.icon}</span>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {wallet.name}
                {wallet.badge && (
                  <span className="badge badge-green" style={{ fontSize: '0.6875rem' }}>
                    ⚡ {wallet.badge}
                  </span>
                )}
                {wallet.recommended && !wallet.badge && (
                  <span className="badge badge-cyan" style={{ fontSize: '0.6875rem' }}>Recommended</span>
                )}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
                {wallet.description}
              </div>
            </div>
            <span style={{ color: 'var(--text-muted)' }}>→</span>
          </button>
        ))}

        {/* Error */}
        {error && (
          <div style={{
            marginTop: '1rem',
            padding: '0.875rem',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: 'var(--accent-red)',
            fontSize: '0.875rem',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Beginner help */}
        <div className="divider" />
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
            🆕 New to crypto wallets?
          </p>
          <a
            href="/onboarding"
            style={{ color: 'var(--accent-cyan)', fontSize: '0.875rem', fontWeight: 500 }}
            onClick={onClose}
          >
            Learn about wallets in 2 minutes →
          </a>
        </div>
      </div>
    </div>
  );
}
