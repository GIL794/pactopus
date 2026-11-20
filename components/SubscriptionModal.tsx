'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useWallet } from '@/lib/wallet';
import WalletModal from '@/components/WalletModal';
import { CURRENCY_CONFIG, ARC_CHAIN, parseTokenAmount, PLATFORM_WALLET } from '@/lib/arc';
import { useMutation } from '@tanstack/react-query';
import { usePactopusAuth } from '@/lib/use-pactopus-auth';

interface SubscriptionModalProps {
  plan: 'free' | 'pro' | 'business';
  price: string;
  onClose: () => void;
  onSuccess: () => void;
  triggerRef?: React.RefObject<HTMLElement>;
}

export default function SubscriptionModal({ plan, onClose, onSuccess, triggerRef }: SubscriptionModalProps) {
  const { isConnected, isWrongNetwork, switchNetwork, address, network, getActiveEvmProvider } = useWallet();
  const { sign } = usePactopusAuth();
  const [step, setStep] = useState<'review' | 'paying' | 'success' | 'error'>('review');
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');

  const usdcPerMonth = plan === 'pro' ? '15.00' : plan === 'business' ? '50.00' : '0.00';

  const modalRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!isConnected) {
        setShowWalletModal(true);
        throw new Error('Please connect a wallet to continue.');
      }

      if (network === 'algorand') {
        // The server only verifies Arc subscription payments today. Sending Algorand funds here
        // could never be credited, so refuse before the wallet is ever opened.
        throw new Error('Subscription upgrades are available on Arc only for now. Switch to an Arc wallet to upgrade.');
      }

      if (isWrongNetwork) {
        await switchNetwork();
      }

      const provider = getActiveEvmProvider() as { request: (args: unknown) => Promise<string> } | null;
      if (!provider) throw new Error('No Arc/EVM wallet found. Install MetaMask (or use WalletConnect) and try again.');

      const planAmountUSDC = plan === 'pro' ? '15.0' : '50.0';
      const config = CURRENCY_CONFIG.USDC;
      const rawAmount = parseTokenAmount(planAmountUSDC);

      const funcSelector = '0xa9059cbb';
      const encodedTo = PLATFORM_WALLET.slice(2).padStart(64, '0');
      const encodedAmt = rawAmount.toString(16).padStart(64, '0');
      const data = funcSelector + encodedTo + encodedAmt;

      const txParams = {
        from: address,
        to: config.address,
        data,
        chainId: `0x${ARC_CHAIN.id.toString(16)}`,
      };

      return await provider.request({
        method: 'eth_sendTransaction',
        params: [txParams],
      });
    },
    onMutate: () => {
      setStep('paying');
      setError('');
    },
    onSuccess: async (hash: string) => {
      setTxHash(hash);
      try {
        const body = { txHash: hash, tier: plan, payerAddress: address };
        const authHeaders = await sign({ method: 'POST', pathname: '/api/pay', body });
        const res = await fetch('/api/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(body),
        });
        const data2 = await res.json();
        if (!res.ok) {
          throw new Error(data2.error || 'We could not confirm that payment. Please try again.');
        }

        setStep('success');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || 'We could not confirm that payment. Please try again.');
        setStep('error');
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'Please connect a wallet to continue.') return;
      setError(msg || 'Transaction failed');
      setStep('error');
    }
  });

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
      aria-labelledby="sub-modal-title"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{ overscrollBehavior: 'contain' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 id="sub-modal-title" className="heading-lg" style={{ textTransform: 'capitalize' }}>Upgrade to {plan}</h3>
          <button className="btn-close" onClick={onClose} aria-label="Close subscription modal">×</button>
        </div>

        {step === 'review' && (
          <div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Confirm your subscription upgrade. You will pay in USDC on Arc.
            </p>
            <div className="card-flat" style={{ marginBottom: '1.5rem', backgroundColor: 'rgba(0,0,0,0.2)', backgroundImage: 'none', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span>Subtotal</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{usdcPerMonth} USDC</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.5rem' }}>
                <span>Total Due</span>
                <span className="gradient-text-gold" style={{ fontVariantNumeric: 'tabular-nums' }}>{usdcPerMonth} USDC</span>
              </div>
            </div>
            {network === 'algorand' && (
              <p role="alert" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                Subscription upgrades are available on Arc only for now.
              </p>
            )}
            <button className="btn btn-primary btn-full" disabled={network === 'algorand'} onClick={() => payMutation.mutate()}>
              Confirm Escrow & Upgrade
            </button>
          </div>
        )}

        {step === 'paying' && (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div className="loader" style={{ margin: '0 auto 1.5rem' }} />
            <h4 className="heading-md" style={{ marginBottom: '0.5rem' }}>Confirming Payment</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Confirm the transaction in your wallet to lock payment.
            </p>
            {txHash && (
              <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Hash: {txHash.slice(0, 12)}...
              </p>
            )}
          </div>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛡️</div>
            <h4 className="heading-md" style={{ marginBottom: '0.5rem' }}>[ Payment Successful ]</h4>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              Your account has been bound by code to the {plan} tier.
            </p>
            <button className="btn btn-primary btn-full" onClick={onSuccess}>
              Go to Dashboard
            </button>
          </div>
        )}

        {step === 'error' && (
          <div>
            <div style={{ color: 'var(--accent-red)', fontSize: '2.5rem', textAlign: 'center', marginBottom: '1rem' }}>⚠️</div>
            <h4 className="heading-md" style={{ marginBottom: '0.5rem', textAlign: 'center' }}>Payment didn&apos;t go through</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.5rem', textAlign: 'center' }}>
              {error}
            </p>
            <button className="btn btn-primary btn-full" onClick={() => setStep('review')}>
              Retry Signing
            </button>
          </div>
        )}
      </div>
      {showWalletModal && <WalletModal onClose={() => setShowWalletModal(false)} />}
    </div>
  );
}
