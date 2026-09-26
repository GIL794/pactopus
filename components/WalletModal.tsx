'use client';

import { useWallet, WalletType } from '@/lib/wallet';
import { useEffect, useRef } from 'react';

interface WalletModalProps {
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement>;
}

const EVM_WALLETS = [
  {
    type: 'passkey' as WalletType,
    name: 'Passkey / Face ID',
    description: 'Instant 1-click biometric sign-in (No seed phrase)',
    icon: '🔑',
    color: '#00F0FF',
    badge: 'Fastest',
    recommended: true,
  },
  {
    type: 'exodus' as WalletType,
    name: 'Exodus Wallet',
    description: 'Multi-chain Web3 browser extension & mobile app',
    icon: '🚀',
    color: '#8b5cf6',
    recommended: false,
  },
  {
    type: 'metamask' as WalletType,
    name: 'MetaMask',
    description: 'Most popular EVM wallet — 30M+ users',
    icon: '🦊',
    color: '#f6851b',
    recommended: false,
  },
  {
    type: 'phantom' as WalletType,
    name: 'Phantom',
    description: 'Multi-chain passkey & EVM wallet',
    icon: '👻',
    color: '#ab9ff2',
    recommended: false,
  },
  {
    type: 'coinbase' as WalletType,
    name: 'Coinbase Smart Wallet',
    description: 'Passkey-native smart account',
    icon: '🔵',
    color: '#0052ff',
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

const ALGO_WALLETS = [
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
  const { connect, isConnecting, isConnected, error, network } = useWallet();

  const wallets = network === 'algorand' ? ALGO_WALLETS : EVM_WALLETS;
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on success
  useEffect(() => {
    if (isConnected) onClose();
  }, [isConnected, onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Focus first element + restore trigger on unmount
  useEffect(() => {
    if (!modalRef.current) return;
    const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
    );
    const first = focusable?.[0];
    first?.focus();
    return () => {
      triggerRef?.current?.focus();
    };
  }, [triggerRef]);

  // Focus trap
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h2 id="wallet-modal-title" className="heading-lg">Connect your {network === 'algorand' ? 'Algorand' : 'Arc (EVM)'} wallet</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
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
                {'badge' in wallet && (wallet as any).badge && (
                  <span className="badge badge-green" style={{ fontSize: '0.6875rem' }}>
                    ⚡ {(wallet as any).badge}
                  </span>
                )}
                {wallet.recommended && !('badge' in wallet) && (
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
