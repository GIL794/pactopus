'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useWallet } from '@/lib/wallet';
import { usePactopusAuth } from '@/lib/use-pactopus-auth';
import { SUBSCRIPTION_PRICES_USD } from '@/lib/circle-checkout';
import toast from 'react-hot-toast';

export default function UpgradePlanButton({ compact = false }: { compact?: boolean }) {
  const { address, isConnected, network } = useWallet();
  const { sign } = usePactopusAuth();
  const [selectedTier, setSelectedTier] = useState<'pro' | 'business'>('pro');

  const mutation = useMutation({
    mutationFn: async (tier: 'pro' | 'business') => {
      if (!isConnected || !address) throw new Error('Connect a wallet before upgrading.');
      if (network === 'algorand') {
        throw new Error('Subscription upgrades are available on Arc only for now. Switch to an Arc wallet to upgrade.');
      }
      const host = window.location.origin;
      const body = {
        tier,
        successUrl: `${host}/dashboard?upgrade=${tier}`,
        cancelUrl: `${host}/dashboard?cancelled=1`,
      };
      const headers = await sign({ method: 'POST', pathname: '/api/circle/checkout', body });
      const res = await fetch('/api/circle/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: 'Failed to create checkout' }));
        throw new Error(e.error || `Status ${res.status}`);
      }
      const { session } = await res.json();
      if (!session?.checkoutUrl) throw new Error('No checkout URL returned by Circle.');
      return session.checkoutUrl;
    },
    onSuccess: (checkoutUrl) => {
      window.location.href = checkoutUrl;
    },
    onError: (err) => {
      toast.error((err as Error).message || 'Upgrade failed — please try again.');
    },
  });

  return (
    <div style={compact ? { display: 'inline-block' } : undefined}>
      {!compact && (
        <div style={{ marginBottom: '.75rem' }}>
          <div role="group" aria-label="Select upgrade tier" style={{ display: 'inline-flex', gap: '.5rem' }}>
            <button
              type="button"
              className={selectedTier === 'pro' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => setSelectedTier('pro')}
            >
              Pro · {SUBSCRIPTION_PRICES_USD.pro.amount} USDC/mo
            </button>
            <button
              type="button"
              className={selectedTier === 'business' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => setSelectedTier('business')}
            >
              Business · {SUBSCRIPTION_PRICES_USD.business.amount} USDC/mo
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        className="btn btn-primary"
        disabled={mutation.isPending || !isConnected || network === 'algorand'}
        title={network === 'algorand' ? 'Switch to an Arc wallet to upgrade subscription tier' : undefined}
        onClick={() => mutation.mutate(selectedTier)}
      >
        {mutation.isPending
          ? 'Opening checkout…'
          : compact
          ? `Upgrade to ${selectedTier.toUpperCase()}`
          : `Upgrade to ${selectedTier.toUpperCase()} — pay with card (Circle)`}
      </button>
    </div>
  );
}
