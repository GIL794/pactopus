'use client';

import { useState, useEffect, use, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PactopusLogo from '@/components/PactopusLogo';
import { WalletProvider, useWallet } from '@/lib/wallet';
import WalletModal from '@/components/WalletModal';
import { CURRENCY_CONFIG, ARC_CHAIN, getTxLink, parseTokenAmount, PLATFORM_FEE_BPS, PLATFORM_WALLET } from '@/lib/arc';
import { getAlgoTxLink, ALGO_PLATFORM_WALLET, ACTIVE_ALGO_NETWORK } from '@/lib/algo';
import algosdk from 'algosdk';
import { algoAmountUnits } from '@/lib/algorand-payment';
import { recordMilestone } from '@/lib/milestones';
import type { Invoice } from '@/lib/store';
import { usePactopusAuth } from '@/lib/use-pactopus-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

type PayStep = 'review' | 'connect' | 'confirm' | 'paying' | 'paid' | 'error' | 'done';

function formatAlgoUnits(units: bigint): string {
  const whole = units / BigInt(1_000_000);
  const fraction = (units % BigInt(1_000_000)).toString().padStart(6, '0');
  return `${whole}.${fraction}`;
}

interface PayPageProps {
  params: Promise<{ id: string }>;
}

function PaymentContent({ invoiceId }: { invoiceId: string }) {
  const queryClient = useQueryClient();
  const { address, isConnected, isWrongNetwork, switchNetwork, network, setNetwork, walletType, signAlgorandGroup } = useWallet();
  const { sign } = usePactopusAuth();
  const searchParams = useSearchParams();
  const isCreator = searchParams.get('created') === 'true';

  const [step, setStep] = useState<PayStep>('review');
  const [txHash, setTxHash] = useState('');
  // Persist broadcast receipts so a temporary Indexer/API delay cannot prompt
  // a second wallet payment. Retry verifies the same atomic group instead.
  const pendingKey = `pactopus_pending_payment_${invoiceId}`;
  const [pendingPayment, setPendingPayment] = useState<{ payoutHash: string; feeHash: string; payerAddress: string; network: string } | null>(() => {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch { return null; }
  });
  const [error, setError] = useState('');
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // TanStack Query to fetch single invoice details
  const { data: invoice, isLoading, isError } = useQuery<Invoice>({
    queryKey: ['invoice', invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${invoiceId}`);
      if (!res.ok) throw new Error('Invoice not found');
      const data = await res.json();
      return data.invoice;
    },
  });

  // Sync network state and invoice payment status
  useEffect(() => {
    if (!invoice) return;

    if (invoice.status === 'paid') {
      setStep('paid');
    }

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

  // TanStack Mutation to execute invoice payments
  const payMutation = useMutation({
    mutationFn: async () => {
      if (!invoice) throw new Error('We could not load this invoice. Please refresh and try again.');
      if (pendingPayment) {
        if (!isConnected || !address || pendingPayment.payerAddress !== address || pendingPayment.network !== invoice.network) {
          throw new Error('Reconnect the original payment wallet to verify this transaction. Do not pay again.');
        }
        return pendingPayment;
      }
      if (!isConnected || !address) throw new Error('Please connect a wallet to pay this invoice.');
      
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
        const feeRaw = (totalRaw * BigInt(50)) / BigInt(10000);
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
      const provider = (window as any).ethereum;
      if (!provider) throw new Error('No Arc/EVM wallet found. Install MetaMask (or use WalletConnect) and try again.');

      if (isWrongNetwork) {
        await switchNetwork();
      }

      const config = CURRENCY_CONFIG[invoice.currency as 'USDC' | 'EURC'];
      const rawAmount = parseTokenAmount(invoice.amount);
      const feeRaw = (rawAmount * BigInt(PLATFORM_FEE_BPS)) / BigInt(10000);
      const netRaw = rawAmount - feeRaw;

      const funcSelector = '0xa9059cbb';

      // Payout transfer
      const payoutTxParams = {
        from: address,
        to: config.address,
        data: funcSelector + invoice.recipientAddress.slice(2).padStart(64, '0') + netRaw.toString(16).padStart(64, '0'),
        chainId: `0x${ARC_CHAIN.id.toString(16)}`,
      };

      const payoutHash: string = await provider.request({
        method: 'eth_sendTransaction',
        params: [payoutTxParams],
      });

      // Platform fee transfer
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
    onSuccess: async ({ payoutHash, feeHash }: any) => {
      setTxHash(payoutHash);
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

        // Invalidate queries so that state is refreshed globally
        queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
        queryClient.invalidateQueries({ queryKey: ['dashboardStats', network] });

        recordMilestone('first_payment_completed');
        localStorage.removeItem(pendingKey);
        setPendingPayment(null);
        setStep('paid');
      } catch (err: any) {
        setError(err.message || 'Verification failed');
        setStep('error');
      }
    },
    onError: (err: any) => {
      const isReject = err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 4001;
      if (isReject) {
        setError('Transaction rejected by wallet');
        setStep('review');
      } else {
        setError(err.message || 'Transaction failed');
        setStep('error');
      }
    }
  });

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
        <p style={{ color: 'var(--text-muted)' }}>Loading invoice details…</p>
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

  const isAlgorandInvoice = invoice.network === 'algorand';
  const assetRaw = isAlgorandInvoice ? algoAmountUnits(invoice.amount) : BigInt(0);
  const feeRawDisplay = isAlgorandInvoice ? assetRaw * BigInt(50) / BigInt(10000) : BigInt(0);
  const feeAmount = isAlgorandInvoice ? formatAlgoUnits(feeRawDisplay) : (parseFloat(invoice.amount) * 0.005).toFixed(2);
  const netAmount = isAlgorandInvoice ? formatAlgoUnits(assetRaw - feeRawDisplay) : (parseFloat(invoice.amount) * 0.995).toFixed(2);
  const currencyEmoji = invoice.currency === 'USDC' ? '💵' : '💶';
  const isAlgo = network === 'algorand';

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
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
          <span style={{ fontSize: '1.25rem' }}>⚖️</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 600, marginBottom: '0.125rem' }}>Invoice ready!</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Share this link with your client to get paid.</p>
          </div>
          <button
            className={`btn btn-primary btn-sm ${copied ? 'copy-flash' : ''}`}
            onClick={copyLink}
            id="copy-payment-link-btn"
          >
            {copied ? '✓ Copied!' : '🔗 Copy link'}
          </button>
        </div>
      )}

      {/* Invoice Card */}
      <div className="card" style={{ marginBottom: '1.5rem', borderTop: '3px solid var(--accent-gold)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' }}>
          <div>
            <div className="navbar-logo" style={{ fontSize: '1.125rem', marginBottom: '0.25rem' }}>
              <PactopusLogo height={28} />
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              {new Date(invoice.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <span className={`badge ${invoice.status === 'paid' ? 'badge-green' : 'badge-cyan'}`}>
            {invoice.status === 'paid' ? '✓ Paid' : '⏳ Pending'}
          </span>
        </div>

        {/* Amount */}
        <div style={{ textAlign: 'center', marginBottom: '2rem', padding: '1.5rem', background: 'rgba(var(--brand-rgb), 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(var(--brand-rgb), 0.22)' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{currencyEmoji} Invoice Amount</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '3.5rem', fontWeight: 800, color: 'var(--accent-gold)', lineHeight: 1 }}>
            {parseFloat(invoice.amount).toLocaleString()}
          </div>
          <div style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>{invoice.currency}</div>
        </div>

        {/* Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>For</span>
            <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '65%' }}>{invoice.description}</span>
          </div>
          {invoice.recipientName && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Payee</span>
              <span style={{ fontWeight: 600 }}>{invoice.recipientName}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>To wallet</span>
            <span style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--text-secondary)', wordBreak: 'break-all', maxWidth: '70%', textAlign: 'right' }}>
              {invoice.recipientAddress.length > 20 ? (
                `${invoice.recipientAddress.slice(0, 10)}…${invoice.recipientAddress.slice(-10)}`
              ) : (
                invoice.recipientAddress
              )}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Network</span>
            <span className={`badge ${isAlgo ? 'badge-cyan' : 'badge-purple'}`} style={{ fontSize: '0.75rem' }}>
              {isAlgo ? '⚡ Algorand Testnet' : '⚡ Arc Testnet'}
            </span>
          </div>
        </div>
      </div>

      {/* Payment action area */}
      {(() => {
        const isPaid = step === 'paid';
        const isPayingNow = step === 'paying' || payMutation.isPending;
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
            <h3 className="heading-lg" style={{ color: 'var(--success)', marginBottom: '0.5rem' }}>Payment received!</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', marginBottom: '1.5rem' }}>
              {isAlgorandInvoice ? netAmount : parseFloat(netAmount).toLocaleString()} {invoice.currency} paid successfully on the {isAlgo ? 'Algorand' : 'Arc'} network.
            </p>
            {(txHash || invoice.txHash) && (
              <a
                href={isAlgo ? getAlgoTxLink(txHash || invoice.txHash!) : getTxLink(txHash || invoice.txHash!)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm"
                id="view-tx-link"
              >
                🔍 View on {isAlgo ? 'Algorand Explorer' : 'Arc Explorer'}
              </a>
            )}
            <div style={{ marginTop: '1.5rem' }}>
              <Link href="/create" className="btn btn-secondary btn-sm">
                Create New Invoice
              </Link>
            </div>
          </div>
        ) : (
          <div className="card" style={{ borderTop: '3px solid var(--accent-red)' }}>
            <h3 className="heading-md" style={{ marginBottom: '1.5rem', fontFamily: 'var(--font-display)', color: 'var(--accent-gold)' }}>Pay Invoice</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              Pactopus is serving the {isAlgo ? 'Algorand' : 'Arc'} version of this payment screen and has already adapted its primary colors to match that chain.
            </p>

            {/* Steps */}
            <div className="step-list" style={{ marginBottom: '2rem' }}>
              <div className="step-item">
                <div className={`step-icon ${isConnected ? 'done' : step === 'connect' ? 'active' : 'pending'}`} style={{ borderColor: 'var(--accent-gold)' }}>
                  {isConnected ? '✓' : 'I'}
                </div>
                <div className="step-content">
                  <div className="step-title">Connect your wallet</div>
                  <div className="step-desc">
                    {isAlgo ? 'Pera Wallet' : 'MetaMask, Coinbase Wallet, or WalletConnect'}
                  </div>
                </div>
              </div>
              <div className="step-item">
                <div className={`step-icon ${isPayingNow ? 'active' : isPaid ? 'done' : 'pending'}`} style={{ borderColor: 'var(--accent-gold)' }}>
                  {isPaid ? '✓' : 'II'}
                </div>
                <div className="step-content">
                  <div className="step-title">Confirm Payment in Wallet</div>
                  <div className="step-desc">
                    {isAlgo ? 'Approve the transfer in your wallet' : 'Approve the transfer in your wallet (small network fee may apply)'}
                  </div>
                </div>
              </div>
              <div className="step-item">
                <div className={`step-icon ${isPaid ? 'done' : 'pending'}`} style={{ borderColor: 'var(--accent-gold)' }}>
                  {isPaid ? '✓' : 'III'}
                </div>
                <div className="step-content">
                  <div className="step-title">Done and delivered</div>
                  <div className="step-desc">Funds arrive on {isAlgo ? 'Algorand' : 'Arc'} and the invoice updates automatically</div>
                </div>
              </div>
            </div>

            {/* Fee summary */}
            <div style={{ background: 'var(--field-bg)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.5rem', fontSize: '0.875rem', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                <span>You release</span><span>{parseFloat(invoice.amount).toLocaleString()} {invoice.currency}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                <span>Pactopus Fee (0.5%)</span><span>-{feeAmount} {invoice.currency}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--accent-gold)' }}>
                <span>Recipient receives</span><span>{isAlgorandInvoice ? netAmount : parseFloat(netAmount).toLocaleString()} {invoice.currency}</span>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{ padding: '0.875rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--accent-red)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                ⚠️ {error}
              </div>
            )}

            {/* CTA */}
            {!isConnected ? (
              <button
                className="btn btn-primary btn-full btn-lg btn-pulse"
                onClick={() => setShowWalletModal(true)}
                id="pay-connect-wallet-btn"
              >
                🔌 Connect wallet to pay
              </button>
            ) : isAlgo && walletType !== 'pera' ? (
              <button className="btn btn-primary btn-full btn-lg" onClick={() => setShowWalletModal(true)}>Connect Pera Wallet on Algorand Testnet</button>
            ) : !isAlgo && isWrongNetwork ? (
              <button
                className="btn btn-purple btn-full btn-lg"
                onClick={switchNetwork}
                id="switch-network-btn"
              >
                🔄 Switch to Arc network
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
                    Paying on {isAlgo ? 'Algorand' : 'Arc'} network…
                  </span>
                ) : (
                  pendingPayment ? '🔍 Retry payment verification' : `⚡ Pay ${parseFloat(invoice.amount).toLocaleString()} ${invoice.currency}`
                )}
              </button>
            )}

            {/* New to wallets */}
            {!isConnected && (
              <p style={{ textAlign: 'center', marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                No wallet yet?{' '}
                <Link href="/onboarding" style={{ color: 'var(--accent-cyan)' }}>
                  Learn about wallets in 2 min →
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
    <WalletProvider>
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
    </WalletProvider>
  );
}
