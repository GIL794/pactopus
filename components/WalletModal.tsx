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

const SOLANA_WALLETS: WalletOption[] = [
  {
    type: 'seeker' as WalletType,
    name: 'Solana Seeker · Seed Vault (MWA 2.0)',
    description: 'Hardware biometric signing — unlocks 0.25% fee capped at £5 max',
    icon: '📱',
    color: '#14F195',
    badge: '0.25% · Max £5 Cap',
    recommended: true,
  },
  {
    type: 'phantom-solana' as WalletType,
    name: 'Phantom (Solana)',
    description: 'Leading Solana wallet — auto-detects Seeker Genesis Token',
    icon: '👻',
    color: '#9945FF',
    recommended: true,
  },
  {
    type: 'solflare' as WalletType,
    name: 'Solflare',
    description: 'Non-custodial Solana web, mobile & hardware wallet',
    icon: '☀️',
    color: '#FC7227',
    recommended: false,
  },
  {
    type: 'backpack' as WalletType,
    name: 'Backpack',
    description: 'xNFT & Solana Blinks-ready wallet extension',
    icon: '🎒',
    color: '#E33E3F',
    recommended: false,
  },
];

export default function WalletModal({ onClose, triggerRef }: WalletModalProps) {
  const { connect, isConnecting, isConnected, error, network, toggleSeekerMode } = useWallet();
  const isSeeker = network === 'seeker';
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
              <h2 id="wallet-modal-title" className="heading-lg" style={{ margin: 0 }}>
                Connect your {isSeeker ? 'Solana Seeker' : 'Solana'} wallet
              </h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
              Non-custodial SPL USDC &amp; EURC settlement. Seeker phone holders unlock 0.25% capped at £5 max; standard web pays 0.5% capped at £50 max.
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

        {/* Chameleon Hardware Mode Switcher in Modal */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.7rem 0.9rem',
          marginBottom: '1.25rem',
          background: 'var(--field-bg)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          fontSize: '0.8125rem',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            Chameleon Theme:{' '}
            <strong style={{ color: 'var(--accent-cyan)' }}>
              {isSeeker ? '📱 Solana Seeker (0.25% · Max £5)' : '◎ Solana Web (0.50% · Max £50)'}
            </strong>
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={toggleSeekerMode}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.65rem' }}
          >
            Pair {isSeeker ? 'Standard Web (0.5%)' : 'Solana Seeker (0.25%)'} →
          </button>
        </div>

        {/* Wallet options */}
        {SOLANA_WALLETS.map(wallet => (
          <button
            key={wallet.type}
            className="wallet-option"
            onClick={() => connect(wallet.type)}
            disabled={isConnecting}
            id={`connect-${wallet.type}-btn`}
          >
            <span style={{ fontSize: '1.5rem' }}>{wallet.icon}</span>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
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
            📱 Using a Solana Seeker phone or new to Solana wallets?
          </p>
          <a
            href="/onboarding"
            style={{ color: 'var(--accent-cyan)', fontSize: '0.875rem', fontWeight: 500 }}
            onClick={onClose}
          >
            Learn how Seeker 0.25% hardware pairing works →
          </a>
        </div>
      </div>
    </div>
  );
}
