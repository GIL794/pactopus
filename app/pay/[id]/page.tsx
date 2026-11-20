'use client';

import { useState, useEffect, use, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PactopusLogo from '@/components/PactopusLogo';
import { useWallet } from '@/lib/wallet';
import WalletModal from '@/components/WalletModal';
import { CURRENCY_CONFIG, ARC_CHAIN, getTxLink, PLATFORM_FEE_BPS, PLATFORM_WALLET } from '@/lib/arc';
import { getAlgoTxLink, ALGO_PLATFORM_WALLET, ACTIVE_ALGO_NETWORK } from '@/lib/algo';
import {
  getSolanaTxLink,
  splitSolanaAmount,
  unitsToDecimalString as solUnitsToDecimalString,
  PAYMENT_LIFECYCLE_STATES,
  type PaymentLifecycleState,
} from '@/lib/solana';
import algosdk from 'algosdk';
import { algoAmountUnits } from '@/lib/algorand-payment';
import { splitAmount, unitsToDecimalString } from '@/lib/arc-settlement';
import { recordMilestone } from '@/lib/milestones';
import type { Invoice } from '@/lib/store';
import { usePactopusAuth } from '@/lib/use-pactopus-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

type PayStep = 'review' | 'connect' | 'confirm' | 'paying' | 'paid' | 'error' | 'done';

interface PayPageProps {
  params: Promise<{ id: string }>;
}

interface InvoiceWithFeeResponse {
  invoice: Invoice;
  feeBps?: number;
  maxCapGbp?: number;
  seekerVerified?: boolean;
}

function PaymentContent({ invoiceId }: { invoiceId: string }) {
  const queryClient = useQueryClient();
  const {
    address,
    isConnected,
    isWrongNetwork,
    switchNetwork,
    network,
    setNetwork,
    walletType,
    seekerVerified,
    signAlgorandGroup,
    getActiveEvmProvider,
  } = useWallet();
  const { sign } = usePactopusAuth();
  const searchParams = useSearchParams();
  const isCreator = searchParams.get('created') === 'true';

  const [userStep, setUserStep] = useState<PayStep | null>(null);
  const [txHash, setTxHash] = useState('');
  const [liveState, setLiveState] = useState<PaymentLifecycleState | null>(null);
  const [manualSignature, setManualSignature] = useState('');
  const [showRecoveryPanel, setShowRecoveryPanel] = useState(false);

  // Persist broadcast receipts so a temporary RPC/API delay cannot prompt a second wallet payment.
  const pendingKey = `pactopus_pending_payment_${invoiceId}`;
  const [pendingPayment, setPendingPayment] = useState<{ payoutHash: string; feeHash: string; payerAddress: string; network: string } | null>(() => {
    if (typeof window !== 'undefined') {
      try { return JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch { return null; }
    }
    return null;
  });
  const [error, setError] = useState('');
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedBlink, setCopiedBlink] = useState(false);

  // TanStack Query to fetch single invoice details
  const { data: invoiceData, isLoading, isError } = useQuery<InvoiceWithFeeResponse>({
    queryKey: ['invoice', invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${invoiceId}`);
      if (!res.ok && res.status !== 410) throw new Error('Invoice not found');
      const data = await res.json();
      if (!data.invoice) throw new Error('Invoice not found');
      return {
        invoice: data.invoice as Invoice,
        feeBps: typeof data.feeBps === 'number' ? data.feeBps : PLATFORM_FEE_BPS,
        maxCapGbp: typeof data.maxCapGbp === 'number' ? data.maxCapGbp : 50,
        seekerVerified: Boolean(data.seekerVerified || data.invoice?.seekerVerified),
      };
    },
  });

  const invoice = invoiceData?.invoice;
  const isSolanaFamily = invoice?.network === 'solana' || invoice?.network === 'seeker';
  const isSeekerInvoice = invoice?.network === 'seeker' || Boolean(invoice?.seekerVerified) || seekerVerified;
  const activeFeeBps = isSeekerInvoice ? 25 : (invoiceData?.feeBps ?? PLATFORM_FEE_BPS);
  const feePercentLabel = isSeekerInvoice ? '0.25%' : `${(activeFeeBps / 100).toFixed(2)}%`;
  const maxCapLabel = isSeekerInvoice ? '£5 Max Cap' : '£50 Max Cap';

  const step: PayStep = invoice?.status === 'paid' ? 'paid' : (userStep ?? 'review');
  const setStep = setUserStep;

  // Sync network state when invoice indicates specific chain
  useEffect(() => {
    if (!invoice) return;
    if (invoice.network && invoice.network !== network) {
      setNetwork(invoice.network);
    }
  }, [invoice, network, setNetwork]);

  const copyLink = async () => {
    const url = typeof window !== 'undefined' ? window.location.href.split('?')[0] : '';
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const copySolanaPayUri = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://pactopus.kyrvynltd.co.uk';
    const solanaPayUri = `solana:${encodeURIComponent(`${origin}/api/solana-pay/${invoiceId}`)}`;
    await navigator.clipboard.writeText(solanaPayUri);
    setCopiedBlink(true);
    setTimeout(() => setCopiedBlink(false), 2500);
  };

  // Recovery mutation via Reference Key or Manual Signature
  const recoverMutation = useMutation({
    mutationFn: async () => {
      if (!invoice) throw new Error('Invoice not loaded');
      setLiveState('submitted');
      const body: Record<string, unknown> = {
        invoiceId: invoice.id,
        payerAddress: address || undefined,
      };
      if (manualSignature.trim()) {
        body.txHash = manualSignature.trim();
      } else {
        body.recoverByReference = true;
      }
      const res = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not find matching on-chain settlement yet.');
      return data;
    },
    onSuccess: (data) => {
      if (data.invoice?.txHash) setTxHash(data.invoice.txHash);
      setLiveState('accounted');
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      recordMilestone('first_payment_completed');
      localStorage.removeItem(pendingKey);
      setPendingPayment(null);
      setStep('paid');
      setError('');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'No matching transaction found for this reference key yet.');
    },
  });

  // TanStack Mutation to execute invoice payments
  const payMutation = useMutation({
    mutationFn: async () => {
      if (!invoice) throw new Error('We could not load this invoice. Please refresh and try again.');
      if (invoice.status === 'expired') throw new Error('This invoice has expired and can no longer be paid.');
      if (pendingPayment) {
        if (!isConnected || !address || pendingPayment.payerAddress !== address || pendingPayment.network !== invoice.network) {
          throw new Error('Reconnect the original payment wallet to verify this transaction. Do not pay again.');
        }
        if (pendingPayment.feeHash || pendingPayment.network !== 'arc') return pendingPayment;
      }
      if (!isConnected || !address) throw new Error('Please connect a wallet to pay this invoice.');

      // Solana / Seeker Atomic SPL Payment Flow
      if (invoice.network === 'solana' || invoice.network === 'seeker') {
        setLiveState('authorised');

        // Request the Solana Pay transaction layout from our Action endpoint
        const actionRes = await fetch(`/api/solana-pay/${invoice.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account: address }),
        });
        const actionData = await actionRes.json();
        if (!actionRes.ok) {
          throw new Error(actionData.error || 'Failed to build Solana Pay atomic split transaction.');
        }

        setLiveState('submitted');

        if (manualSignature.trim()) {
          const receipt = {
            payoutHash: manualSignature.trim(),
            feeHash: manualSignature.trim(),
            payerAddress: address,
            network: invoice.network,
          };
          localStorage.setItem(pendingKey, JSON.stringify(receipt));
          setPendingPayment(receipt);
          return receipt;
        }

        throw new Error(
          'Solana Pay Atomic Transaction built! Scan the Solana Pay URI from your Solana Seeker Seed Vault / Phantom mobile wallet, or paste your confirmed Solana transaction signature below and click "Verify / Recover On-Chain Settlement".'
        );
      }

      if (network !== invoice.network) throw new Error('Connect a wallet on the invoice network to pay.');
      const isAlgo = network === 'algorand';
      const planAmount = parseFloat(invoice.amount);

      if (isAlgo) {
        if (walletType !== 'pera' || !algosdk.isValidAddress(address) || !algosdk.isValidAddress(ALGO_PLATFORM_WALLET)) {
          throw new Error('Algorand payment requires Pera Wallet and a configured Algorand treasury address.');
        }
        if (!Number.isFinite(planAmount) || !/^\d+(?:\.\d{1,6})?$/.test(invoice.amount)) {
          throw new Error('Invalid invoice amount for Algorand transfer.');
        }
        const totalRaw = algoAmountUnits(invoice.amount);
        const feeRaw = (totalRaw * BigInt(activeFeeBps)) / BigInt(10000);
        const netRaw = totalRaw - feeRaw;
        if (!algosdk.isValidAddress(invoice.recipientAddress) || !['USDC', 'EURC'].includes(invoice.currency)) throw new Error('Invalid Algorand invoice recipient or asset.');
        if (feeRaw <= BigInt(0)) throw new Error('Invoice amount is too small for a platform fee transfer.');
        const assetId = invoice.currency === 'USDC' ? 10458941 : 230190169;
        const algod = new algosdk.Algodv2('', ACTIVE_ALGO_NETWORK.algodUrl, '');
        const params = await algod.getTransactionParams().do();
        const payout = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: address, receiver: invoice.recipientAddress, amount: netRaw,
          assetIndex: assetId, suggestedParams: params,
        });
        const fee = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: address, receiver: ALGO_PLATFORM_WALLET, amount: feeRaw,
          assetIndex: assetId, suggestedParams: params,
        });
        algosdk.assignGroupID([payout, fee]);
        const feeHash = fee.txID();
        const rememberSignedGroup = (payoutHash: string) => {
          const receipt = { payoutHash, feeHash, payerAddress: address, network: 'algorand' };
          localStorage.setItem(pendingKey, JSON.stringify(receipt));
          setPendingPayment(receipt);
        };
        const payoutHash = await signAlgorandGroup([payout, fee], rememberSignedGroup);
        return { payoutHash, feeHash, payerAddress: address, network: 'algorand' };
      }

      // EVM
      const provider = getActiveEvmProvider() as { request: (args: unknown) => Promise<string> } | null;
      if (!provider) throw new Error('No Arc/EVM wallet found. Install MetaMask (or use WalletConnect) and try again.');

      if (isWrongNetwork) {
        await switchNetwork();
      }

      const config = CURRENCY_CONFIG[invoice.currency as 'USDC' | 'EURC'];
      const { fee: feeRaw, net: netRaw } = splitAmount(invoice.amount, activeFeeBps);

      const funcSelector = '0xa9059cbb';

      let payoutHash: string;
      if (pendingPayment && !pendingPayment.feeHash) {
        payoutHash = pendingPayment.payoutHash;
      } else {
        const payoutTxParams = {
          from: address,
          to: config.address,
          data: funcSelector + invoice.recipientAddress.slice(2).padStart(64, '0') + netRaw.toString(16).padStart(64, '0'),
          chainId: `0x${ARC_CHAIN.id.toString(16)}`,
        };
        payoutHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [payoutTxParams],
        });
        const partial = { payoutHash, feeHash: '', payerAddress: address, network: 'arc' };
        localStorage.setItem(pendingKey, JSON.stringify(partial));
        setPendingPayment(partial);
      }

      const feeTxParams = {
        from: address,
        to: config.address,
        data: funcSelector + PLATFORM_WALLET.slice(2).padStart(64, '0') + feeRaw.toString(16).padStart(64, '0'),
        chainId: `0x${ARC_CHAIN.id.toString(16)}`,
      };

      const feeHash: string = await provider.request({
        method: 'eth_sendTransaction',
        params: [feeTxParams],
      });

      const receipt = { payoutHash, feeHash, payerAddress: address, network: 'arc' };
      localStorage.setItem(pendingKey, JSON.stringify(receipt));
      setPendingPayment(receipt);
      return receipt;
    },
    onMutate: () => {
      setStep('paying');
      setError('');
    },
    onSuccess: async ({ payoutHash, feeHash }: { payoutHash: string; feeHash?: string }) => {
      setTxHash(payoutHash);
      setLiveState('confirmed');
      try {
        const body = {
          invoiceId: invoice!.id,
          txHash: payoutHash,
          feeTxHash: feeHash,
          payerAddress: address,
        };
        const authHeaders = await sign({ method: 'POST', pathname: '/api/pay', body });
        const res = await fetch('/api/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(body),
        });
        const data2 = await res.json();
        if (!res.ok) throw new Error(data2.error);

        setLiveState('accounted');
        queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
        queryClient.invalidateQueries({ queryKey: ['dashboardStats', network] });

        recordMilestone('first_payment_completed');
        localStorage.removeItem(pendingKey);
        setPendingPayment(null);
        setStep('paid');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || 'Verification failed');
        setStep('error');
      }
    },
    onError: (err: unknown) => {
      const isReject = err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 4001;
      const msg = err instanceof Error ? err.message : String(err);
      if (isReject) {
        setError('Transaction rejected by wallet');
        setStep('review');
      } else {
        setError(msg || 'Transaction failed');
        setStep('error');
      }
    }
  });

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
        <p style={{ color: 'var(--text-muted)' }}>Loading Solana Pay invoice details…</p>
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
        <h2 className="heading-lg" style={{ marginBottom: '0.75rem' }}>Invoice not found</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>This invoice link may have expired, or been removed.</p>
        <Link href="/" className="btn btn-primary">Go to Home →</Link>
      </div>
    );
  }

  let feeAmount = '0.00';
  let netAmount = '0.00';
  let gbpAmount = invoice.gbpAmount || '0.00';
  let gbpFee = invoice.gbpFee || '0.00';
  let gbpNet = invoice.gbpNetAmount || '0.00';
  let isCapped = false;

  try {
    if (isSolanaFamily) {
      const split = splitSolanaAmount(invoice.amount, {
        isSeekerVerified: isSeekerInvoice,
        currency: invoice.currency,
        gbpRate: typeof invoice.gbpRate === 'number' ? invoice.gbpRate : undefined,
      });
      feeAmount = solUnitsToDecimalString(split.fee);
      netAmount = solUnitsToDecimalString(split.net);
      gbpAmount = split.gbpAmount;
      gbpFee = split.gbpFee;
      gbpNet = split.gbpNetAmount;
      isCapped = split.isCapped;
    } else {
      const split = splitAmount(invoice.amount, activeFeeBps);
      feeAmount = unitsToDecimalString(split.fee);
      netAmount = unitsToDecimalString(split.net);
    }
  } catch {
    feeAmount = (parseFloat(invoice.amount) * (activeFeeBps / 10000)).toFixed(2);
    netAmount = (parseFloat(invoice.amount) * (1 - activeFeeBps / 10000)).toFixed(2);
  }

  const currencyEmoji = invoice.currency === 'USDC' ? '💵' : '💶';
  const isAlgo = invoice.network === 'algorand';
  const isExpired = invoice.status === 'expired';
  const currentPaymentState: PaymentLifecycleState =
    invoice.status === 'paid'
      ? 'accounted'
      : liveState || invoice.paymentState || 'requested';
  const activeStateIndex = PAYMENT_LIFECYCLE_STATES.indexOf(currentPaymentState);

  const explorerLink = (hash: string) => {
    if (isSolanaFamily) return getSolanaTxLink(hash);
    if (isAlgo) return getAlgoTxLink(hash);
    return getTxLink(hash);
  };

  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      {/* Creator banner */}
      {isCreator && (
        <div style={{
          padding: '1rem 1.25rem',
          background: 'rgba(var(--brand-rgb), 0.10)',
          border: '1px solid rgba(var(--brand-rgb), 0.28)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '1.25rem' }}>⚡</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 600, marginBottom: '0.125rem' }}>Solana Pay Invoice &amp; Blink Ready!</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Share this link or Solana Pay Action URI with your client.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`btn btn-primary btn-sm ${copied ? 'copy-flash' : ''}`}
              onClick={copyLink}
              id="copy-payment-link-btn"
            >
              {copied ? '✓ Copied!' : '🔗 Copy link'}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={copySolanaPayUri}
              id="copy-solana-pay-uri-btn"
            >
              {copiedBlink ? '✓ URI Copied!' : '📱 Copy Solana Pay URI'}
            </button>
          </div>
        </div>
      )}

      {/* 6-State Live Settlement Telemetry Pipeline */}
      <div className="card" style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-cyan)' }}>
            6-State On-Chain Settlement Pipeline
          </span>
          <span className="seeker-hardware-pill" style={{ fontSize: '0.6875rem', padding: '0.15rem 0.55rem' }}>
            <span className="pulse-dot" />
            {isSeekerInvoice ? 'Seeker 0.25% (Max £5)' : 'Solana Web 0.50% (Max £50)'}
          </span>
        </div>
        <div className="lifecycle-stepper" aria-label="Payment settlement lifecycle">
          {PAYMENT_LIFECYCLE_STATES.map((st, idx) => {
            const isCompleted = idx < activeStateIndex || currentPaymentState === 'accounted';
            const isActive = idx === activeStateIndex && currentPaymentState !== 'accounted';
            return (
              <div
                key={st}
                className={`lifecycle-step ${isCompleted ? 'completed' : isActive ? 'active' : ''}`}
              >
                {isCompleted ? '✓ ' : isActive ? '● ' : ''}{st}
              </div>
            );
          })}
        </div>
      </div>

      {/* Invoice Card */}
      <div className="card" style={{ marginBottom: '1.5rem', borderTop: '3px solid var(--accent-gold)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' }}>
          <div>
            <div className="navbar-logo" style={{ fontSize: '1.125rem', marginBottom: '0.25rem' }}>
              <PactopusLogo height={28} />
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Issued {new Date(invoice.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{invoice.id}</span>
            </p>
          </div>
          <span className={`badge ${invoice.status === 'paid' ? 'badge-green' : isExpired ? 'badge-red' : 'badge-cyan'}`}>
            {invoice.status === 'paid' ? '✓ Accounted' : isExpired ? '✕ Expired' : `⏳ ${currentPaymentState.toUpperCase()}`}
          </span>
        </div>

        {/* Amount */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem', padding: '1.5rem', background: 'rgba(var(--brand-rgb), 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(var(--brand-rgb), 0.22)' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            {currencyEmoji} SPL Stablecoin Invoice Amount
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '3.25rem', fontWeight: 800, color: 'var(--accent-gold)', lineHeight: 1 }}>
            {parseFloat(invoice.amount).toLocaleString()}
          </div>
          <div style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginTop: '0.35rem', fontWeight: 600 }}>
            SPL {invoice.currency} {isSolanaFamily && `(Locked UK Value: £${gbpAmount} GBP)`}
          </div>
        </div>

        {/* Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>For</span>
            <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '68%' }}>{invoice.description}</span>
          </div>
          {invoice.recipientName && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Payee / Studio</span>
              <span style={{ fontWeight: 600 }}>{invoice.recipientName}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Recipient Wallet</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--text-secondary)', wordBreak: 'break-all', maxWidth: '70%', textAlign: 'right' }}>
              {invoice.recipientAddress.length > 20
                ? `${invoice.recipientAddress.slice(0, 10)}…${invoice.recipientAddress.slice(-10)}`
                : invoice.recipientAddress}
            </span>
          </div>
          {invoice.memo && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>SPL Memo</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
                {invoice.memo}
              </span>
            </div>
          )}
          {invoice.referencePubkey && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Solana Pay Reference Key</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {invoice.referencePubkey.slice(0, 10)}…{invoice.referencePubkey.slice(-8)}
              </span>
            </div>
          )}
          {invoice.expiresAt && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>{isExpired ? 'Expired on' : 'Expires'}</span>
              <span style={{ color: isExpired ? 'var(--accent-red)' : 'var(--text-secondary)', fontSize: '0.875rem' }}>
                {new Date(invoice.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>Settlement Rail</span>
            <span className={`badge ${isSeekerInvoice ? 'badge-green' : isSolanaFamily ? 'badge-purple' : isAlgo ? 'badge-cyan' : 'badge-gold'}`} style={{ fontSize: '0.75rem' }}>
              {isSeekerInvoice
                ? '📱 Solana Seeker (MWA 2.0 · 0.25% / £5 Cap)'
                : isSolanaFamily
                  ? '◎ Solana Web (0.50% / £50 Cap)'
                  : isAlgo
                    ? '⚡ Algorand Testnet'
                    : '⚡ Arc Testnet'}
            </span>
          </div>
        </div>
      </div>

      {/* Payment action area */}
      {(() => {
        const isPaid = step === 'paid';
        const isPayingNow = step === 'paying' || payMutation.isPending;
        if (isExpired && !isPaid) {
          return (
            <div className="card" style={{ textAlign: 'center', padding: '2.5rem', borderTop: '3px solid var(--accent-red)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⌛</div>
              <h3 className="heading-lg" style={{ color: 'var(--accent-red)', marginBottom: '0.5rem' }}>Invoice Expired</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', marginBottom: '1.5rem' }}>
                This invoice passed its expiration date and can no longer accept payments. Ask the issuer for an updated payment link.
              </p>
              <Link href="/create" className="btn btn-secondary btn-sm">
                Create New Invoice
              </Link>
            </div>
          );
        }
        return isPaid ? (
          <div style={{
            textAlign: 'center',
            padding: '2.5rem',
            background: 'rgba(var(--success-rgb), 0.10)',
            border: '1px solid rgba(var(--success-rgb), 0.24)',
            borderRadius: 'var(--radius-xl)',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none" style={{ margin: '0 auto' }}>
                <circle cx="32" cy="32" r="30" stroke="var(--accent-green)" strokeWidth="3" />
                <path d="M20 32 L28 40 L44 24" stroke="var(--accent-green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="check-anim" />
              </svg>
            </div>
            <h3 className="heading-lg" style={{ color: 'var(--success)', marginBottom: '0.5rem' }}>
              Settlement Verified &amp; Accounted!
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', marginBottom: '0.75rem' }}>
              <strong>{netAmount} {invoice.currency}</strong> (£{gbpNet} GBP) settled to payee + <strong>{feeAmount} {invoice.currency}</strong> (£{gbpFee} GBP) capped fee.
            </p>
            {invoice.memo && (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                On-Chain Memo: {invoice.memo}
              </p>
            )}
            {(txHash || invoice.txHash) && (
              <a
                href={explorerLink(txHash || invoice.txHash!)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm"
                id="view-tx-link"
              >
                🔍 View on {isSolanaFamily ? 'Solana Explorer' : isAlgo ? 'Algorand Explorer' : 'Arc Explorer'}
              </a>
            )}
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/dashboard" className="btn btn-primary btn-sm">
                View in GBP Dashboard →
              </Link>
              <Link href="/create" className="btn btn-secondary btn-sm">
                Create New Invoice
              </Link>
            </div>
          </div>
        ) : (
          <div className="card" style={{ borderTop: '3px solid var(--accent-cyan)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 className="heading-md" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent-gold)', margin: 0 }}>
                {isSeekerInvoice ? 'Solana Seeker Atomic Checkout' : 'Solana Pay Atomic Checkout'}
              </h3>
              <button
                type="button"
                onClick={copySolanaPayUri}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.75rem' }}
              >
                {copiedBlink ? '✓ Solana Pay URI Copied' : '📱 Copy Solana Pay URI'}
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              Pactopus executes a single non-custodial atomic transaction: your net payout transfers directly to the recipient’s SPL token account, the {feePercentLabel} ({maxCapLabel}) fee routes to Kyrvyn Treasury, and the invoice ID is recorded in an immutable SPL Memo.
            </p>

            {/* Jupiter-style Atomic Route & Fee Breakdown */}
            <div style={{ background: 'var(--field-bg)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.25rem', fontSize: '0.875rem', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                <span>Gross Release</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  {parseFloat(invoice.amount).toLocaleString()} {invoice.currency} {isSolanaFamily && `(£${gbpAmount})`}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <span>Pactopus Fee ({feePercentLabel} · {maxCapLabel})</span>
                  {isCapped && (
                    <span className="badge badge-green" style={{ fontSize: '0.6875rem', padding: '0.1rem 0.45rem' }}>
                      Cap Applied!
                    </span>
                  )}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                  -{feeAmount} {invoice.currency} {isSolanaFamily && `(£${gbpFee})`}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--accent-gold)', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem' }}>
                <span>Recipient Net Settlement</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>
                  {netAmount} {invoice.currency} {isSolanaFamily && `(£${gbpNet})`}
                </span>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{ padding: '0.875rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--accent-red)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                ⚠️ {error}
              </div>
            )}

            {/* Primary CTA */}
            {!isConnected ? (
              <button
                className="btn btn-primary btn-full btn-lg btn-pulse"
                onClick={() => setShowWalletModal(true)}
                id="pay-connect-wallet-btn"
              >
                🔌 Connect Solana Seeker / Phantom to Pay
              </button>
            ) : (
              <button
                className="btn btn-primary btn-full btn-lg btn-pulse"
                onClick={() => payMutation.mutate()}
                disabled={isPayingNow}
                id="pay-now-btn"
              >
                {isPayingNow ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
                      <path d="M10 2a8 8 0 018 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Executing Atomic Settlement…
                  </span>
                ) : (
                  pendingPayment ? '🔍 Retry payment verification' : `⚡ Pay ${parseFloat(invoice.amount).toLocaleString()} ${invoice.currency}`
                )}
              </button>
            )}

            {/* On-Chain Reference Key & Signature Recovery Panel */}
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  Paid from a mobile wallet or interrupted tab?
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '0.75rem' }}
                  onClick={() => setShowRecoveryPanel(!showRecoveryPanel)}
                  id="toggle-recovery-panel-btn"
                >
                  {showRecoveryPanel ? 'Hide Recovery' : '🔄 Recover / Verify On-Chain Payment'}
                </button>
              </div>

              {showRecoveryPanel && (
                <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="Optional: Paste Solana transaction signature (or leave blank to scan by Reference Key)"
                    value={manualSignature}
                    onChange={e => setManualSignature(e.target.value)}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}
                    id="recovery-signature-input"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-full"
                    onClick={() => recoverMutation.mutate()}
                    disabled={recoverMutation.isPending}
                    id="recover-by-reference-btn"
                  >
                    {recoverMutation.isPending
                      ? '⏳ Scanning Solana RPC for Reference Key & SPL Memo…'
                      : '🔍 Scan & Recover Settlement via Reference Key'}
                  </button>
                </div>
              )}
            </div>

            {/* New to wallets */}
            {!isConnected && (
              <p style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                No Solana wallet yet?{' '}
                <Link href="/onboarding" style={{ color: 'var(--accent-cyan)' }}>
                  Learn about Seeker Seed Vault &amp; Phantom in 2 min →
                </Link>
              </p>
            )}
          </div>
        );
      })()}

      {showWalletModal && <WalletModal onClose={() => setShowWalletModal(false)} />}

      {/* Share link (for non-creator) */}
      {!isCreator && step !== 'paid' && (
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={copyLink} id="copy-pay-link-btn">
            {copied ? '✓ Link copied' : '🔗 Share this link'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function PayPage({ params }: PayPageProps) {
  const { id } = use(params);

  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050506', color: '#fff' }}>
        <div className="loader" />
      </div>
    }>
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div style={{ paddingTop: '8rem', paddingBottom: '4rem' }}>
          <div className="container">
            <PaymentContent invoiceId={id} />
          </div>
        </div>
      </div>
    </Suspense>
  );
}
