'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PactopusLogo from '@/components/PactopusLogo';
import PactopusCopilot from '@/components/PactopusCopilot';
import { useWallet } from '@/lib/wallet';
import WalletModal from '@/components/WalletModal';
import { isValidAlgorandAddress } from '@/lib/algo';
import { recordMilestone } from '@/lib/milestones';
import { usePactopusAuth } from '@/lib/use-pactopus-auth';
import UpgradePlanButton from '@/components/UpgradePlanButton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { splitAmount, unitsToDecimalString } from '@/lib/arc-settlement';
import { getFeeBpsForTier } from '@/lib/billing';

type Currency = 'USDC' | 'EURC';
type ExpiryDays = 'none' | '7' | '14' | '30';

interface FormData {
  amount: string;
  currency: Currency;
  description: string;
  recipientAddress: string;
  recipientName: string;
}

function CreateForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { address, isConnected, network } = useWallet();
  const { sign, signedFetch } = usePactopusAuth();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [form, setForm] = useState<FormData>({
    amount: '',
    currency: 'USDC',
    description: '',
    recipientAddress: address || '',
    recipientName: '',
  });
  const [expiryDays, setExpiryDays] = useState<ExpiryDays>('none');
  const [errors, setErrors] = useState<Partial<FormData>>({});

  const [prevAddress, setPrevAddress] = useState(address);
  if (address !== prevAddress) {
    setPrevAddress(address);
    if (address) {
      setForm((f: FormData) => ({ ...f, recipientAddress: address }));
    }
  }

  // Pull server-side scoped stats: per (ownerWallet, network, currentMonth) + tier from Prisma.
  const { data: stats } = useQuery({
    queryKey: ['dashboardStats', network, address],
    queryFn: async () => {
      const res = await signedFetch(`/api/invoices?network=${network}`, { method: 'GET' });
      if (!res.ok) throw new Error('Failed to fetch invoice count');
      return res.json();
    },
    enabled: isConnected,
  });

  const subTier: 'free' | 'pro' | 'business' =
    stats?.tier && (stats.tier === 'free' || stats.tier === 'pro' || stats.tier === 'business')
      ? stats.tier
      : 'free';

  const feeBps = getFeeBpsForTier(subTier);
  const feePercentLabel = `${(feeBps / 100).toFixed(1)}%`;

  const invoicesUsedThisMonth = typeof stats?.invoicesUsedThisMonth === 'number' ? stats.invoicesUsedThisMonth : 0;
  const invoicesAllowedThisMonth = typeof stats?.invoicesAllowedThisMonth === 'number' ? stats.invoicesAllowedThisMonth : 5;
  const invoiceCount = invoicesUsedThisMonth;
  const isBlocked = subTier === 'free' && invoicesUsedThisMonth >= invoicesAllowedThisMonth;

  // Auto-fill wallet address when connected
  const handleConnectFill = () => {
    if (address) setForm((f: FormData) => ({ ...f, recipientAddress: address }));
  };

  const validate = (): boolean => {
    const newErrors: Partial<FormData> = {};
    if (isBlocked) {
      newErrors.description = 'You’ve hit the Free plan limit. Upgrade to keep creating invoices.';
      return false;
    }
    if (!form.amount || parseFloat(form.amount) <= 0) newErrors.amount = 'Add an amount greater than 0';
    if (!form.description || form.description.trim().length < 3) newErrors.description = 'Add a short description (at least 3 characters)';

    // Address validation based on current network mode
    if (network === 'arc') {
      if (!form.recipientAddress || !form.recipientAddress.startsWith('0x') || form.recipientAddress.length !== 42) {
        newErrors.recipientAddress = 'Paste a valid Arc/EVM wallet address (starts with 0x)';
      }
    } else {
      if (!isValidAlgorandAddress(form.recipientAddress)) {
        newErrors.recipientAddress = 'Paste a valid Algorand wallet address';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  interface CreateInvoicePayload extends FormData {
    network: 'arc' | 'algorand';
    expiresAt?: string;
  }

  const createMutation = useMutation({
    mutationFn: async (payload: CreateInvoicePayload) => {
      const body = payload;
      const headers = await sign({ method: 'POST', pathname: '/api/invoices', body });
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create invoice');
      return data.invoice;
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['dashboardStats', network, address] });
      recordMilestone('first_invoice_created');
      router.push(`/pay/${invoice.id}?created=true`);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setErrors({ description: msg || 'Failed to create invoice' });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const expiresAt =
      expiryDays !== 'none'
        ? new Date(Date.now() + parseInt(expiryDays, 10) * 24 * 60 * 60 * 1000).toISOString()
        : undefined;
    createMutation.mutate({
      ...form,
      network,
      ...(expiresAt ? { expiresAt } : {}),
    });
  };

  let feeAmount = '0.00';
  let netAmount = '0.00';
  if (form.amount && /^\d+(?:\.\d{1,6})?$/.test(form.amount) && parseFloat(form.amount) > 0) {
    try {
      const split = splitAmount(form.amount, feeBps);
      feeAmount = unitsToDecimalString(split.fee);
      netAmount = unitsToDecimalString(split.net);
    } catch {
      feeAmount = (parseFloat(form.amount) * (feeBps / 10000)).toFixed(2);
      netAmount = (parseFloat(form.amount) * (1 - feeBps / 10000)).toFixed(2);
    }
  }

  const isAlgo = network === 'algorand';
  const [showCopilot, setShowCopilot] = useState(false);

  const handleFillSample = () => {
    if (network === 'arc') {
      setForm({
        amount: '50.00',
        currency: 'USDC',
        description: 'Arc Testnet Integration & Payment Demo — Milestone 1',
        recipientAddress: address || '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
        recipientName: 'Kyrvyn Studio',
      });
      setErrors({});
    } else {
      setForm({
        amount: '50.00',
        currency: 'USDC',
        description: 'Algorand Smart Contract Audit & Review',
        recipientAddress: address || 'J32G7FGD4S6A3R2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7TS',
        recipientName: 'Kyrvyn Studio',
      });
      setErrors({});
    }
  };

  const handleCopilotFill = (parsedData: {
    amount: string;
    currency: 'USDC' | 'EURC';
    description: string;
    recipientAddress: string;
    recipientName: string;
  }) => {
    setForm((prev: FormData) => ({
      ...prev,
      amount: parsedData.amount || prev.amount,
      currency: parsedData.currency || prev.currency,
      description: parsedData.description || prev.description,
      recipientAddress: parsedData.recipientAddress || prev.recipientAddress,
      recipientName: parsedData.recipientName || prev.recipientName,
    }));
  };

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
        {/* Tier status banner */}
        <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-card)', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🛡️</span>
            <div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Active Network Workspace</div>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', textTransform: 'uppercase' }} className={isAlgo ? "gradient-text-cyan" : "gradient-text-gold"}>
                {isAlgo ? 'Algorand Testnet' : 'Arc L1 Testnet'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleFillSample}
              className="btn btn-secondary btn-sm"
              id="fill-sample-btn"
              title={`Auto-fill sample data for ${network === 'arc' ? 'Arc' : 'Algorand'} testnet`}
            >
              ⚡ Fill {network === 'arc' ? 'Arc' : 'Algorand'} Sample
            </button>
            <button
              type="button"
              onClick={() => setShowCopilot(!showCopilot)}
              className="btn btn-secondary btn-sm"
              style={{ borderColor: showCopilot ? 'var(--accent-cyan)' : undefined }}
            >
              {showCopilot ? '✕ Close Assistant' : '🧩 Smart Parser'}
            </button>
            {subTier === 'free' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <span className="badge badge-cyan" style={{ border: '1px solid var(--border)' }}>
                  {invoiceCount} / {invoicesAllowedThisMonth} invoices this month
                </span>
                <UpgradePlanButton compact />
              </div>
            ) : (
              <span className="badge badge-green">
                ✓ {subTier.toUpperCase()} ({invoicesAllowedThisMonth.toLocaleString()}/mo · {feePercentLabel} fee)
              </span>
            )}
          </div>
        </div>

        {/* Optional Smart Parser Panel */}
        {showCopilot && (
          <div style={{ gridColumn: 'span 2', marginBottom: '1rem' }}>
            <PactopusCopilot onFillForm={handleCopilotFill} currentForm={form} />
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          {/* Amount + Currency */}
          <div style={{ marginBottom: '1.5rem' }}>
            <fieldset style={{ padding: 0, margin: 0, border: 'none' }}>
              <legend className="input-label" style={{ marginBottom: '0.625rem', display: 'block', padding: 0, width: '100%' }}>
                Invoice amount and currency
              </legend>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="invoice-amount-input" className="sr-only">Amount</label>
                  <input
                    type="number"
                    name="invoiceAmount"
                    inputMode="decimal"
                    autoComplete="off"
                    className={`input input-lg ${errors.amount ? 'input-error' : ''}`}
                    placeholder="0.00"
                    value={form.amount}
                    onChange={e => setForm((f: FormData) => ({ ...f, amount: e.target.value }))}
                    min="0"
                    step="0.01"
                    id="invoice-amount-input"
                    style={{ borderColor: errors.amount ? 'var(--accent-red)' : undefined }}
                  />
                  {errors.amount && <p style={{ color: 'var(--accent-red)', fontSize: '0.8125rem', marginTop: '0.25rem' }}>{errors.amount}</p>}
                </div>
                <div className="currency-toggle" style={{ flexShrink: 0 }} role="group" aria-label="Invoice currency">
                  <button
                    type="button"
                    className={`currency-toggle-btn ${form.currency === 'USDC' ? 'active usdc' : ''}`}
                    onClick={() => setForm((f: FormData) => ({ ...f, currency: 'USDC' }))}
                    id="select-usdc-btn"
                    aria-pressed={form.currency === 'USDC'}
                  >
                    💵 USDC
                  </button>
                  <button
                    type="button"
                    className={`currency-toggle-btn ${form.currency === 'EURC' ? 'active eurc' : ''}`}
                    onClick={() => setForm((f: FormData) => ({ ...f, currency: 'EURC' }))}
                    id="select-eurc-btn"
                    aria-pressed={form.currency === 'EURC'}
                  >
                    💶 EURC
                  </button>
                </div>
              </div>
            </fieldset>
          </div>

          {/* Description */}
          <div className="input-group" style={{ marginBottom: '1.5rem' }}>
            <label className="input-label" htmlFor="invoice-description">
              What’s this invoice for?
            </label>
            <textarea
              id="invoice-description"
              name="invoiceDescription"
              className="input"
              placeholder={isAlgo ? "e.g. Algorand dApp testing retained services — Q3 2026" : "e.g. Brand strategy consulting — Q3 2026, 20 hours"}
              value={form.description}
              onChange={e => setForm((f: FormData) => ({ ...f, description: e.target.value }))}
              rows={3}
              style={{ borderColor: errors.description ? 'var(--accent-red)' : undefined }}
            />
            {errors.description && <p style={{ color: 'var(--accent-red)', fontSize: '0.8125rem' }}>{errors.description}</p>}
          </div>

          {/* Your name */}
          <div className="input-group" style={{ marginBottom: '1.5rem' }}>
            <label className="input-label" htmlFor="invoice-recipient-name">
              Your name or studio (optional)
            </label>
            <input
              id="invoice-recipient-name"
              name="invoiceRecipientName"
              type="text"
              autoComplete="name"
              className="input"
              placeholder="e.g. Kyrvyn Studio"
              value={form.recipientName}
              onChange={e => setForm((f: FormData) => ({ ...f, recipientName: e.target.value }))}
            />
          </div>

          {/* Invoice Expiration */}
          <div className="input-group" style={{ marginBottom: '1.5rem' }}>
            <label className="input-label" htmlFor="invoice-expiry-select">
              Payment expiration (optional)
            </label>
            <select
              id="invoice-expiry-select"
              name="invoiceExpiry"
              className="input"
              value={expiryDays}
              onChange={e => setExpiryDays(e.target.value as ExpiryDays)}
            >
              <option value="none">No expiration</option>
              <option value="7">Expires in 7 days</option>
              <option value="14">Expires in 14 days</option>
              <option value="30">Expires in 30 days</option>
            </select>
          </div>

          {/* Wallet Address */}
          <div className="input-group" style={{ marginBottom: '2rem' }}>
            <label className="input-label" htmlFor="invoice-wallet-address" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Where should the money go? <span style={{ color: 'var(--accent-red)' }}>*</span></span>
              {isConnected && address && (
                <button
                  type="button"
                  onClick={handleConnectFill}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem' }}
                  aria-label="Fill wallet address from currently connected wallet"
                >
                  Use connected wallet
                </button>
              )}
            </label>
            <input
              id="invoice-wallet-address"
              name="invoiceWalletAddress"
              type="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="input"
              placeholder={isAlgo ? "Paste your Algorand address…" : "Paste your 0x address…"}
              value={form.recipientAddress}
              onChange={e => setForm((f: FormData) => ({ ...f, recipientAddress: e.target.value }))}
              style={{
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                borderColor: errors.recipientAddress ? 'var(--accent-red)' : undefined,
              }}
            />
            {errors.recipientAddress && (
              <p style={{ color: 'var(--accent-red)', fontSize: '0.8125rem' }}>{errors.recipientAddress}</p>
            )}
            {!isConnected && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                  Need a wallet?
                </p>
                <button type="button" onClick={() => setShowWalletModal(true)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem' }}>
                  Pick a wallet
                </button>
              </div>
            )}
            <div className="tooltip-wrapper" style={{ marginTop: '0.375rem' }}>
              <button
                type="button"
                aria-label="Help: What is a wallet address?"
                aria-describedby="wallet-address-help"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8125rem', cursor: 'help', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                ℹ️ What is a wallet address?
              </button>
              <div id="wallet-address-help" className="tooltip" role="tooltip" style={{ whiteSpace: 'normal', maxWidth: 280, textAlign: 'left' }}>
                {isAlgo ? (
                  "This is your receiving address on Algorand. When someone pays, the stablecoins go straight here."
                ) : (
                  "This is your receiving address on Arc/EVM. When someone pays, the stablecoins go straight here."
                )}
              </div>
            </div>
          </div>

          {isBlocked && (
            <div style={{
              padding: '1rem',
              background: 'rgba(var(--danger-rgb), 0.10)',
              border: '1px solid rgba(var(--danger-rgb), 0.22)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--danger)',
              fontSize: '0.875rem',
              marginBottom: '1.5rem',
              lineHeight: 1.5
            }}>
              ⚠️ <strong>You’ve used all {invoicesAllowedThisMonth} Free invoices for this billing month.</strong> Upgrade to Pro (10,000/mo) or Business (1,000,000/mo) to continue creating invoices, or wait until your billing cycle resets.
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={createMutation.isPending || isBlocked}
            id="create-invoice-submit-btn"
          >
            {createMutation.isPending ? 'Creating your invoice…' : isBlocked ? '🔒 Upgrade to keep going' : 'Create invoice'}
          </button>
        </form>

        {/* Live Preview */}
        <div>
          <p className="label" style={{ color: 'var(--accent-gold)', marginBottom: '1rem' }}>Preview</p>

          <div className="invoice-preview" style={{ borderTop: '3px solid var(--accent-gold)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div>
                <div className="navbar-logo" style={{ marginBottom: '0.25rem', fontSize: '1.125rem' }}>
                  <PactopusLogo height={28} />
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Quick summary</p>
              </div>
              <span className={`badge ${form.currency === 'USDC' ? 'badge-green' : 'badge-gold'}`}>
                {form.currency}
              </span>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <p className="invoice-preview currency-label">
                {form.currency === 'USDC' ? '🇺🇸 US Dollar Coin' : '🇪🇺 Euro Coin'}
              </p>
              <div className="invoice-preview amount" style={{ color: form.currency === 'USDC' ? 'var(--accent-green)' : 'var(--accent-gold)' }}>
                {form.amount ? parseFloat(form.amount).toLocaleString() : '0.00'}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>{form.currency}</p>
            </div>

            <div className="divider" />

            {form.description && (
              <div style={{ marginBottom: '1rem' }}>
                <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>For</p>
                <p style={{ fontSize: '0.9375rem' }}>{form.description}</p>
              </div>
            )}

            {form.recipientName && (
              <div style={{ marginBottom: '1rem' }}>
                <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>From</p>
                <p style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{form.recipientName}</p>
              </div>
            )}

            {form.recipientAddress && (
              <div style={{ marginBottom: '1rem' }}>
                <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>To wallet</p>
                <p style={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                  {isAlgo ? (
                    form.recipientAddress.length > 20 ? (
                      `${form.recipientAddress.slice(0, 12)}…${form.recipientAddress.slice(-12)}`
                    ) : (
                      form.recipientAddress
                    )
                  ) : (
                    form.recipientAddress.startsWith('0x') && form.recipientAddress.length === 42 ? (
                      `${form.recipientAddress.slice(0, 10)}…${form.recipientAddress.slice(-8)}`
                    ) : (
                      form.recipientAddress
                    )
                  )}
                </p>
              </div>
            )}

            <div className="divider" />

            {/* Fee breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Total</span>
                <span>{form.amount || '0.00'} {form.currency}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Pactopus fee ({feePercentLabel})</span>
                <span>-{feeAmount} {form.currency}</span>
              </div>
              <div className="divider" style={{ margin: '0.25rem 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--text-primary)' }}>
                <span>You receive</span>
                <span style={{ color: 'var(--accent-gold)' }}>
                  {netAmount} {form.currency}
                </span>
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
              <span className="badge badge-cyan">
                {isAlgo ? '⚡ Settles on Algorand in 1.5s' : '⚡ Settles on Arc in <1s'}
              </span>
            </div>
          </div>

          {/* Wallet guide */}
          <div className="card" style={{ marginTop: '1.25rem', padding: '1.25rem' }}>
            <h4 style={{ fontWeight: 600, marginBottom: '0.625rem', fontSize: '0.9375rem' }}>🆕 No wallet yet?</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginBottom: '0.875rem' }}>
              A wallet is a free app that holds your stablecoins. It takes 2 minutes to set up.
            </p>
            {isAlgo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <a
                  href="https://perawallet.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm btn-full"
                  id="pera-install-link"
                >
                  📱 Get Pera Wallet (Algorand Mobile / Web)
                </a>
              </div>
            ) : (
              <a
                href="https://metamask.io"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm btn-full"
                id="metamask-install-link"
              >
                🦊 Get MetaMask (free)
              </a>
            )}
          </div>
        </div>
      </div>

      {showWalletModal && <WalletModal onClose={() => setShowWalletModal(false)} />}
    </>
  );
}

export default function CreatePage() {
  return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar />
      <div style={{ paddingTop: '8rem', paddingBottom: '4rem' }}>
        <div className="container-md">
          {/* Header */}
          <div style={{ marginBottom: '2.5rem' }}>
            <p className="label" style={{ color: 'var(--accent-gold)', marginBottom: '0.5rem' }}>New invoice</p>
            <h1 className="display-md" style={{ marginBottom: '0.75rem', fontFamily: 'var(--font-display)' }}>
              Create an invoice
            </h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              Add the basics, preview it on the right, then share the link to get paid.
            </p>
          </div>

          <CreateForm />
        </div>
      </div>
    </div>
  );
}
