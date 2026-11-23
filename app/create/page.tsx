'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PactopusLogo from '@/components/PactopusLogo';
import PactopusCopilot from '@/components/PactopusCopilot';
import { useWallet } from '@/lib/wallet';
import WalletModal from '@/components/WalletModal';
import { isValidAlgorandAddress } from '@/lib/algo';
import {
  DEFAULT_GBP_RATES,
  isValidSolanaAddress,
  splitSolanaAmount,
  unitsToDecimalString as solUnitsToDecimalString,
  type LiveGbpFxQuote,
} from '@/lib/solana';
import { recordMilestone } from '@/lib/milestones';
import { usePactopusAuth } from '@/lib/use-pactopus-auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { splitAmount, unitsToDecimalString } from '@/lib/arc-settlement';

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
  const { address, isConnected, network, setNetwork, seekerVerified, seekerVerificationReason } = useWallet();
  const { sign } = usePactopusAuth();
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

  const { data: liveFx } = useQuery<LiveGbpFxQuote>({
    queryKey: ['gbpFxQuote'],
    queryFn: async () => {
      const res = await fetch('/api/fx/gbp');
      if (!res.ok) throw new Error('FX unavailable');
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });

  const activeGbpRate =
    liveFx && typeof liveFx[form.currency] === 'number' && liveFx[form.currency] > 0
      ? liveFx[form.currency]
      : DEFAULT_GBP_RATES[form.currency];

  const [prevAddress, setPrevAddress] = useState(address);
  if (address !== prevAddress) {
    setPrevAddress(address);
    if (address) {
      setForm((f: FormData) => ({ ...f, recipientAddress: address }));
    }
  }

  const isSeeker = network === 'seeker' || seekerVerified;
  const isSolanaFamily = network === 'solana' || network === 'seeker';
  const isAlgo = network === 'algorand';

  const feePercentLabel = isSeeker ? '0.25%' : '0.50%';
  const maxCapLabel = isSeeker ? '£5 max cap' : '£50 max cap';

  // Auto-fill wallet address when connected
  const handleConnectFill = () => {
    if (address) setForm((f: FormData) => ({ ...f, recipientAddress: address }));
  };

  const validate = (): boolean => {
    const newErrors: Partial<FormData> = {};
    if (!form.amount || parseFloat(form.amount) <= 0) newErrors.amount = 'Add an amount greater than 0';
    if (!form.description || form.description.trim().length < 3) newErrors.description = 'Add a short description (at least 3 characters)';

    // Address validation based on current network mode
    if (isSolanaFamily) {
      if (!isValidSolanaAddress(form.recipientAddress)) {
        newErrors.recipientAddress = 'Paste a valid Solana Base58 wallet address (32–44 characters)';
      }
    } else if (network === 'arc') {
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
    network: 'solana' | 'seeker' | 'arc' | 'algorand';
    seekerVerified?: boolean;
    gbpRate?: number;
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
      seekerVerified,
      gbpRate: activeGbpRate,
      ...(expiresAt ? { expiresAt } : {}),
    });
  };

  let feeAmount = '0.00';
  let netAmount = '0.00';
  let gbpGross = '0.00';
  let gbpFee = '0.00';
  let gbpNet = '0.00';
  let isCapApplied = false;

  if (form.amount && /^\d+(?:\.\d{1,6})?$/.test(form.amount) && parseFloat(form.amount) > 0) {
    try {
      if (isSolanaFamily) {
        const split = splitSolanaAmount(form.amount, {
          isSeekerVerified: isSeeker,
          currency: form.currency,
          gbpRate: activeGbpRate,
        });
        feeAmount = solUnitsToDecimalString(split.fee);
        netAmount = solUnitsToDecimalString(split.net);
        gbpGross = split.gbpAmount;
        gbpFee = split.gbpFee;
        gbpNet = split.gbpNetAmount;
        isCapApplied = split.isCapped;
      } else {
        const feeBps = isSeeker ? 25 : 50;
        const split = splitAmount(form.amount, feeBps);
        feeAmount = unitsToDecimalString(split.fee);
        netAmount = unitsToDecimalString(split.net);
      }
    } catch {
      const rate = isSeeker ? 0.0025 : 0.005;
      feeAmount = (parseFloat(form.amount) * rate).toFixed(2);
      netAmount = (parseFloat(form.amount) * (1 - rate)).toFixed(2);
    }
  }

  const [showCopilot, setShowCopilot] = useState(false);

  const handleFillSample = () => {
    if (network === 'seeker') {
      setForm({
        amount: '4500.00',
        currency: 'USDC',
        description: 'Solana Seeker Mobile Wallet Adapter (MWA 2.0) + Seed Vault Audit — Q4 Milestone',
        recipientAddress: address || '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        recipientName: 'Kyrvyn Studio',
      });
      setErrors({});
    } else if (network === 'solana') {
      setForm({
        amount: '15000.00',
        currency: 'USDC',
        description: 'Solana Anchor Program & Blinks Checkout Architecture — Retainer',
        recipientAddress: address || '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        recipientName: 'Kyrvyn Studio',
      });
      setErrors({});
    } else if (network === 'arc') {
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
      <div className="create-grid">
        {/* Hardware Pairing & Fee Policy Status Banner */}
        <div className="create-span-full" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-card)', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>{isSeeker ? '📱' : '◎'}</span>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                {isSeeker ? 'Solana Seeker Hardware Mode (MWA 2.0 / Genesis Token)' : 'Solana Web Mode (Phantom / Solflare / Solana Pay)'}
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.9375rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className={isSeeker ? 'gradient-text-cyan' : 'gradient-text-gold'}>
                  {isSeeker ? '0.25% Fee · Hard Capped at £5 Max' : '0.50% Fee · Hard Capped at £50 Max'}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                  ({seekerVerificationReason})
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setNetwork(isSeeker ? 'solana' : 'seeker')}
              className="seeker-hardware-pill"
              title="Toggle Octopus Chameleon theme between Solana Web (0.5% / £50 cap) and Solana Seeker Hardware (0.25% / £5 cap)"
            >
              <span className="pulse-dot" />
              {isSeeker ? 'Switch to Web (0.5% / £50)' : 'Switch to Seeker (0.25% / £5)'}
            </button>
            <button
              type="button"
              onClick={handleFillSample}
              className="btn btn-secondary btn-sm"
              id="fill-sample-btn"
              title={`Auto-fill sample invoice for ${isSeeker ? 'Solana Seeker' : 'Solana Web'}`}
            >
              ⚡ Fill {isSeeker ? 'Seeker' : 'Solana'} Sample
            </button>
            <button
              type="button"
              onClick={() => setShowCopilot(!showCopilot)}
              className="btn btn-secondary btn-sm"
              style={{ borderColor: showCopilot ? 'var(--accent-cyan)' : undefined }}
            >
              {showCopilot ? '✕ Close Assistant' : '🧩 Smart Parser'}
            </button>
            <span className="badge badge-green">
              ✓ Unlimited Invoices · £0/mo Forever
            </span>
          </div>
        </div>

        {/* Optional Smart Parser Panel */}
        {showCopilot && (
          <div className="create-span-full" style={{ marginBottom: '1rem' }}>
            <PactopusCopilot onFillForm={handleCopilotFill} currentForm={form} />
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          {/* Amount + Currency */}
          <div style={{ marginBottom: '1.5rem' }}>
            <fieldset style={{ padding: 0, margin: 0, border: 'none' }}>
              <legend className="input-label" style={{ marginBottom: '0.625rem', display: 'block', padding: 0, width: '100%' }}>
                Invoice amount and SPL stablecoin
              </legend>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px' }}>
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
              placeholder={isSeeker ? "e.g. Solana Seeker dApp & MWA 2.0 Hardware Integration — Milestone 1" : "e.g. Solana Rust / Anchor Engineering Retainer — Q4 2026"}
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
            <label className="input-label" htmlFor="invoice-wallet-address" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span>Where should the SPL stablecoins go? <span style={{ color: 'var(--accent-red)' }}>*</span></span>
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
              placeholder={isSolanaFamily ? "Paste your Solana Base58 address (e.g. 7xKXtg2CW...)" : isAlgo ? "Paste your Algorand address…" : "Paste your 0x address…"}
              value={form.recipientAddress}
              onChange={e => setForm((f: FormData) => ({ ...f, recipientAddress: e.target.value }))}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.875rem',
                borderColor: errors.recipientAddress ? 'var(--accent-red)' : undefined,
              }}
            />
            {errors.recipientAddress && (
              <p style={{ color: 'var(--accent-red)', fontSize: '0.8125rem' }}>{errors.recipientAddress}</p>
            )}
            {!isConnected && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                  Need a Solana wallet?
                </p>
                <button type="button" onClick={() => setShowWalletModal(true)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem' }}>
                  Connect Seeker / Phantom
                </button>
              </div>
            )}
            <div className="tooltip-wrapper" style={{ marginTop: '0.375rem' }}>
              <button
                type="button"
                aria-label="Help: What is a Solana receiving address?"
                aria-describedby="wallet-address-help"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8125rem', cursor: 'help', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              >
                ℹ️ How does non-custodial settlement work?
              </button>
              <div id="wallet-address-help" className="tooltip" role="tooltip" style={{ whiteSpace: 'normal', maxWidth: 300, textAlign: 'left' }}>
                This is your receiving Solana public key. When your client pays, their SPL {form.currency} transfers directly to your Associated Token Account (auto-initialized via CreateIdempotent if new) in the same atomic transaction as the capped Pactopus fee and SPL Memo.
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={createMutation.isPending}
            id="create-invoice-submit-btn"
          >
            {createMutation.isPending ? 'Generating Solana Pay Invoice + Reference Key…' : 'Create Solana Pay Invoice'}
          </button>
        </form>

        {/* Live Preview */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <p className="label" style={{ color: 'var(--accent-gold)', margin: 0 }}>Live Solana Pay &amp; GBP Accounting Preview</p>
            <span className="seeker-hardware-pill" style={{ fontSize: '0.6875rem', padding: '0.2rem 0.6rem' }}>
              <span className="pulse-dot" />
              {isSeeker ? 'Seeker 0.25% (£5 Cap)' : 'Web 0.50% (£50 Cap)'}
            </span>
          </div>

          <div className="invoice-preview" style={{ borderTop: '3px solid var(--accent-gold)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div>
                <div className="navbar-logo" style={{ marginBottom: '0.25rem', fontSize: '1.125rem' }}>
                  <PactopusLogo height={28} />
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                  {isSeeker ? 'Solana Seeker Hardware Checkout' : 'Solana Pay + Blink Checkout'}
                </p>
              </div>
              <span className={`badge ${form.currency === 'USDC' ? 'badge-green' : 'badge-gold'}`}>
                SPL {form.currency}
              </span>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <p className="invoice-preview currency-label">
                {form.currency === 'USDC' ? '🇺🇸 Circle SPL USD Coin' : '🇪🇺 Circle SPL Euro Coin'}
              </p>
              <div className="invoice-preview amount" style={{ color: form.currency === 'USDC' ? 'var(--accent-green)' : 'var(--accent-gold)', fontFamily: 'var(--font-mono)' }}>
                {form.amount ? parseFloat(form.amount).toLocaleString() : '0.00'}
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>
                {form.currency} · Locked UK Accounting Value: <strong>£{gbpGross} GBP</strong> (1 {form.currency} = £{activeGbpRate.toFixed(4)})
              </p>
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
                <p className="label" style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>To Solana Wallet</p>
                <p style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                  {form.recipientAddress.length > 20
                    ? `${form.recipientAddress.slice(0, 10)}…${form.recipientAddress.slice(-10)}`
                    : form.recipientAddress}
                </p>
              </div>
            )}

            <div className="divider" />

            {/* Jupiter-inspired Atomic Route & Fee Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Gross Invoice Amount</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{form.amount || '0.00'} {form.currency} (£{gbpGross})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                  <span>Pactopus fee ({feePercentLabel} · {maxCapLabel})</span>
                  {isCapApplied && (
                    <span className="badge badge-green" style={{ fontSize: '0.6875rem', padding: '0.1rem 0.45rem' }}>
                      Cap Applied!
                    </span>
                  )}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                  -{feeAmount} {form.currency} (£{gbpFee})
                </span>
              </div>
              <div className="divider" style={{ margin: '0.25rem 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                <span>Net to Your Wallet</span>
                <span style={{ color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)' }}>
                  {netAmount} {form.currency} (£{gbpNet})
                </span>
              </div>
            </div>

            {/* Jupiter-style Atomic Route Pill */}
            <div style={{ marginTop: '1rem' }}>
              <div className="jupiter-route-pill">
                <span>Atomic Route:</span>
                <span>Payer</span>
                <span className="route-arrow">→</span>
                <span>Payee ATA ({netAmount})</span>
                <span className="route-arrow">+</span>
                <span>Kyrvyn Fee ({feeAmount})</span>
                <span className="route-arrow">+</span>
                <span>SPL Memo</span>
              </div>
            </div>

            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <span className="badge badge-cyan">
                {isSeeker
                  ? '📱 Solana Seeker Seed Vault · ~400ms Finality · £5 Max Cap'
                  : '◎ Solana Pay + Blinks · ~400ms Finality · £50 Max Cap'}
              </span>
            </div>
          </div>

          {/* Wallet guide */}
          <div className="card" style={{ marginTop: '1.25rem', padding: '1.25rem' }}>
            <h4 style={{ fontWeight: 600, marginBottom: '0.625rem', fontSize: '0.9375rem' }}>
              📱 Using a Solana Seeker Phone or Web Wallet?
            </h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginBottom: '0.875rem', lineHeight: 1.5 }}>
              Connect your Solana Seeker via Mobile Wallet Adapter 2.0 (Seed Vault) or a wallet holding a Seeker Genesis Token to unlock the <strong>0.25% fee capped at £5 max</strong>. Standard web wallets (Phantom, Solflare, Backpack) pay <strong>0.50% capped at £50 max</strong>.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <a
                href="https://solanamobile.com"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ flex: 1 }}
                id="seeker-learn-link"
              >
                📱 Solana Seeker Mobile
              </a>
              <a
                href="https://phantom.app"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm"
                style={{ flex: 1 }}
                id="phantom-install-link"
              >
                👻 Get Phantom Wallet
              </a>
            </div>
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
            <p className="label" style={{ color: 'var(--accent-gold)', marginBottom: '0.5rem' }}>New Solana Pay Invoice</p>
            <h1 className="display-md" style={{ marginBottom: '0.75rem', fontFamily: 'var(--font-display)' }}>
              Create a Non-Custodial Invoice
            </h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              Issue an SPL USDC or EURC invoice with a deterministic reference key, locked GBP accounting rate, and automatic Seeker £5 / Web £50 fee cap.
            </p>
          </div>

          <CreateForm />
        </div>
      </div>
    </div>
  );
}
