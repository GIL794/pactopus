'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useWallet } from '@/lib/wallet';
import WalletModal from '@/components/WalletModal';
import { recordMilestone } from '@/lib/milestones';
import type { Invoice } from '@/lib/store';
import { getAlgoTxLink } from '@/lib/algo';
import { getTxLink } from '@/lib/arc';
import { getSolanaTxLink } from '@/lib/solana';
import { useQuery } from '@tanstack/react-query';
import ProgressCard from '@/components/ProgressCard';
import { usePactopusAuth } from '@/lib/use-pactopus-auth';

interface DashboardStats {
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  totalEarnedUSDC: string;
  totalEarnedEURC: string;
  earningsThisMonthUSDC: string;
  earningsThisMonthEURC: string;
  earningsThisMonth: string;
  recentInvoices: Invoice[];
  tier: 'free' | 'pro' | 'business';
  invoicesUsedThisMonth: number;
  invoicesAllowedThisMonth: number;
  billingCycleStart: string;
  billingCycleEnd: string;
}

interface P2PDemoResult {
  status: string;
  mode?: string;
  approvalRationale?: string;
  agents?: {
    freelancer?: { name: string; address: string };
    client?: { name: string; address: string };
  };
  payment?: {
    netAmount?: string;
    feeAmount?: string;
    payoutTxHash?: string;
    feeTxHash?: string;
  };
  invoice?: {
    id?: string;
    amount?: string;
    currency?: string;
  };
  onChainLinks?: {
    payoutTxLink?: string | null;
    feeTxLink?: string | null;
  };
}

function DashboardContent() {
  const {
    isConnected,
    address,
    usdcBalance,
    eurcBalance,
    refreshBalances,
    network,
    setNetwork,
    seekerVerified,
    seekerVerificationReason,
  } = useWallet();
  const { signedFetch } = usePactopusAuth();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [p2pDemoLoading, setP2pDemoLoading] = useState(false);
  const [p2pDemoResult, setP2pDemoResult] = useState<P2PDemoResult | null>(null);
  const [p2pDemoError, setP2pDemoError] = useState<string | null>(null);

  const isSeeker = network === 'seeker' || seekerVerified;
  const isSolanaFamily = network === 'solana' || network === 'seeker';
  const isAlgo = network === 'algorand';

  const handleRunP2PDemo = async () => {
    setP2pDemoLoading(true);
    setP2pDemoError(null);
    setP2pDemoResult(null);
    try {
      const res = await fetch('/api/agent/demo-p2p', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Request failed with status ${res.status}`);
      }
      setP2pDemoResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setP2pDemoError(msg || 'Demo failed unexpectedly');
    } finally {
      setP2pDemoLoading(false);
    }
  };

  useEffect(() => {
    if (!isConnected) return;
    recordMilestone('first_dashboard_visit');
  }, [isConnected]);

  // Server-scoped dashboard stats: per owner (wallet address), per network, per current billing month.
  const { data: stats, isLoading, refetch } = useQuery<DashboardStats>({
    queryKey: ['dashboardStats', network, address],
    queryFn: async () => {
      const res = await signedFetch(`/api/invoices?network=${network}`, { method: 'GET' });
      if (!res.ok) throw new Error('Failed to fetch dashboard stats');
      return res.json();
    },
    refetchInterval: 10000,
    enabled: isConnected,
  });

  const handleRefresh = async () => {
    await refreshBalances();
    await refetch();
  };

  const handleExportCsv = () => {
    const invoices = stats?.recentInvoices ?? [];
    if (invoices.length === 0) return;

    const escapeCsv = (val: string | number | undefined) => {
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      'Invoice ID',
      'Description',
      'Token Amount',
      'Currency',
      'Status',
      'Payment Lifecycle State',
      'Hardware Mode',
      'Platform Fee (Token)',
      'FX Rate (GBP)',
      'Gross (GBP)',
      'Fee (GBP)',
      'Net (GBP)',
      'SPL Memo',
      'Solana Reference Key',
      'Recipient Address',
      'Recipient Name',
      'Created At',
      'Paid At',
      'Tx Signature',
    ];
    const rows = invoices.map((inv: Invoice) => [
      escapeCsv(inv.id),
      escapeCsv(inv.description),
      escapeCsv(inv.amount),
      escapeCsv(inv.currency),
      escapeCsv(inv.status),
      escapeCsv(inv.paymentState || (inv.status === 'paid' ? 'accounted' : 'requested')),
      escapeCsv(inv.seekerVerified || inv.network === 'seeker' ? 'Solana Seeker (0.25% / £5 Cap)' : 'Solana Web (0.50% / £50 Cap)'),
      escapeCsv(inv.fee || '0.00'),
      escapeCsv(inv.gbpRate ?? '0.7900'),
      escapeCsv(inv.gbpAmount || ''),
      escapeCsv(inv.gbpFee || ''),
      escapeCsv(inv.gbpNetAmount || ''),
      escapeCsv(inv.memo || ''),
      escapeCsv(inv.referencePubkey || ''),
      escapeCsv(inv.recipientAddress),
      escapeCsv(inv.recipientName),
      escapeCsv(inv.createdAt),
      escapeCsv(inv.paidAt),
      escapeCsv(inv.txHash),
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pactopus-uk-gbp-reconciliation-${network}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const copyInvoiceLink = async (id: string) => {
    const url = `${window.location.origin}/pay/${id}`;
    await navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2500);
  };

  const statusBadge = (inv: Invoice) => {
    const state = inv.paymentState || (inv.status === 'paid' ? 'accounted' : 'requested');
    if (inv.status === 'paid') {
      return <span className="badge badge-green">✓ Accounted</span>;
    }
    if (inv.status === 'expired') {
      return <span className="badge badge-red">Expired</span>;
    }
    return <span className="badge badge-cyan">⏳ {state.toUpperCase()}</span>;
  };

  const explorerLink = (inv: Invoice) => {
    if (!inv.txHash) return '#';
    if (inv.network === 'solana' || inv.network === 'seeker') return getSolanaTxLink(inv.txHash);
    if (inv.network === 'algorand') return getAlgoTxLink(inv.txHash);
    return getTxLink(inv.txHash);
  };

  if (!isConnected) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>📱</div>
        <h2 className="heading-lg" style={{ marginBottom: '0.75rem' }}>Connect Your Solana Seeker or Web Wallet</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', maxWidth: 520, margin: '0 auto 2rem' }}>
          View your non-custodial SPL USDC/EURC invoices, 6-state settlement telemetry, and locked-GBP accountant CSV exports.
        </p>
        <button className="btn btn-primary btn-lg" onClick={() => setShowWalletModal(true)} id="dashboard-connect-btn">
          Connect Seeker / Phantom
        </button>
        {showWalletModal && <WalletModal onClose={() => setShowWalletModal(false)} />}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p className="label" style={{ color: 'var(--accent-gold)', marginBottom: '0.25rem' }}>
            Non-Custodial Reconciliation &amp; UK GBP Accounting
          </p>
          <h1 className="display-md" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontFamily: 'var(--font-display)', textWrap: 'balance', scrollMarginTop: '5rem' }}>
            Your Invoices ({isSeeker ? 'Solana Seeker' : isSolanaFamily ? 'Solana Web' : isAlgo ? 'Algorand' : 'Arc'})
            <span className="seeker-hardware-pill">
              <span className="pulse-dot" />
              {isSeeker ? '0.25% · £5 Max Cap' : '0.50% · £50 Max Cap'}
            </span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', marginTop: '0.375rem', wordBreak: 'break-all' }}>
            Wallet: {address} · {seekerVerificationReason}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setNetwork(isSeeker ? 'solana' : 'seeker')}
            title="Switch between Solana Web and Solana Seeker Hardware Mode"
          >
            {isSeeker ? '◎ Switch to Web View' : '📱 Switch to Seeker View'}
          </button>
          {!!stats?.recentInvoices?.length && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportCsv}
              id="dashboard-export-csv-btn"
            >
              📥 Export UK GBP CSV
            </button>
          )}
          <Link href="/create" className="btn btn-primary" id="dashboard-create-btn">
            New Invoice
          </Link>
        </div>
      </div>

      {/* Balance tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="stat-card" style={{ border: '1px solid rgba(var(--success-rgb), 0.28)' }}>
          <div className="stat-label">💵 SPL USDC Balance</div>
          <div className="stat-value" style={{ color: 'var(--accent-green)', marginTop: '0.5rem', fontFamily: 'var(--font-mono)' }}>{usdcBalance}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Circle SPL USD Coin</div>
        </div>
        <div className="stat-card" style={{ border: '1px solid rgba(var(--brand-rgb), 0.28)' }}>
          <div className="stat-label">💶 SPL EURC Balance</div>
          <div className="stat-value" style={{ color: 'var(--accent-gold)', marginTop: '0.5rem', fontFamily: 'var(--font-mono)' }}>{eurcBalance}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Circle SPL Euro Coin</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">📈 Settled Volume</div>
          <div className="stat-value gradient-text" style={{ marginTop: '0.5rem', fontSize: '1.35rem', fontFamily: 'var(--font-mono)' }}>
            {isLoading
              ? '—'
              : `${parseFloat(stats?.earningsThisMonthUSDC || stats?.totalEarnedUSDC || '0').toLocaleString()} USDC`}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.35rem', fontFamily: 'var(--font-mono)' }}>
            {isLoading
              ? 'Loading…'
              : `+ ${parseFloat(stats?.earningsThisMonthEURC || stats?.totalEarnedEURC || '0').toLocaleString()} EURC`}
          </div>
        </div>
        <div className="stat-card" style={{ border: '1px solid rgba(var(--accent-cyan-rgb), 0.22)' }}>
          <div className="stat-label">📋 Unlimited Invoices (£0/mo)</div>
          <div className="stat-value" style={{ marginTop: '0.5rem', fontFamily: 'var(--font-mono)' }}>
            {isLoading ? '—' : (stats?.totalInvoices ?? 0)}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>{stats?.paidInvoices ?? 0} Accounted</span>
            <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>{stats?.pendingInvoices ?? 0} Open</span>
          </div>
        </div>
      </div>

      {!isLoading && stats && <ProgressCard totalInvoices={stats.totalInvoices} paidInvoices={stats.paidInvoices} />}

      {/* Network & Hardware Pairing Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1.25rem', background: 'var(--field-bg)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', marginBottom: '2.5rem', flexWrap: 'wrap' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-green)', display: 'inline-block', boxShadow: '0 0 8px var(--accent-green)' }} />
        <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
          {isSeeker
            ? 'Solana Seeker Hardware Mode Active (0.25% · £5 Max Cap)'
            : 'Solana Web Mode Active (0.50% · £50 Max Cap)'}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
          Fast Atomic SPL Finality · Deterministic Reference Key · Locked GBP Accounting
        </span>
        <button className="btn btn-secondary btn-sm" onClick={handleRefresh} style={{ marginLeft: 'auto' }}>
          ↻ Refresh Ledger
        </button>
      </div>

      {/* Invoices table */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 className="heading-lg" style={{ fontFamily: 'var(--font-display)' }}>Invoice &amp; Settlement Ledger</h2>
          <Link href="/create" className="btn btn-secondary btn-sm" id="table-create-btn">
            New Invoice
          </Link>
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ height: 64, borderRadius: 'var(--radius-md)' }} />
            ))}
          </div>
        ) : !stats?.recentInvoices?.length ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ fontSize: '2rem', marginBottom: '1rem' }}>📭</p>
            <h3 className="heading-md" style={{ marginBottom: '0.5rem' }}>No invoices in this mode yet</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Create a Solana Pay invoice, share the link or Blink, and settle within seconds.</p>
            <Link href="/create" className="btn btn-primary" id="empty-state-create-btn">
              Create an Invoice
            </Link>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Invoice &amp; SPL Memo</th>
                  <th>SPL Amount</th>
                  <th>Locked GBP (Gross / Fee)</th>
                  <th>6-State Lifecycle</th>
                  <th>Date</th>
                  <th>Solana Signature</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentInvoices.map((inv: Invoice) => (
                  <tr key={inv.id}>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                        {inv.description}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.125rem', fontFamily: 'var(--font-mono)' }}>
                        ID: {inv.id} {inv.memo ? `· ${inv.memo}` : ''}
                      </div>
                    </td>
                    <td>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: inv.currency === 'USDC' ? 'var(--accent-green)' : 'var(--accent-gold)',
                        fontSize: '0.9375rem',
                      }}>
                        {parseFloat(inv.amount).toLocaleString()}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '0.35rem' }}>
                        {inv.currency}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', fontWeight: 600 }}>
                        {inv.gbpAmount ? `£${parseFloat(inv.gbpAmount).toLocaleString()}` : '—'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                        Fee: {inv.gbpFee ? `£${inv.gbpFee}` : (inv.fee ? `${inv.fee} ${inv.currency}` : '—')}
                      </div>
                    </td>
                    <td>{statusBadge(inv)}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                      {new Date(inv.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </td>
                    <td>
                      {inv.txHash ? (
                        <a
                          href={explorerLink(inv)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent-cyan)' }}
                          id={`tx-link-${inv.id}`}
                        >
                          {inv.txHash.slice(0, 10)}…
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {inv.status === 'pending' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => copyInvoiceLink(inv.id)}
                            id={`copy-link-${inv.id}`}
                            aria-label={copied === inv.id ? 'Payment link copied to clipboard' : `Copy payment link for invoice ${inv.id}`}
                            aria-live="polite"
                          >
                            {copied === inv.id ? '✓' : '🔗'}
                          </button>
                        )}
                        <Link href={`/pay/${inv.id}`} className="btn btn-ghost btn-sm" id={`view-invoice-${inv.id}`} aria-label={`View invoice ${inv.id} details and payment page`}>
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Business model callout */}
      <div className="card" style={{ marginTop: '2.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', background: 'rgba(var(--brand-tertiary-rgb), 0.06)', border: '1px solid rgba(var(--brand-rgb), 0.22)' }}>
        <div style={{ flex: 1 }}>
          <h3 className="heading-md" style={{ marginBottom: '0.375rem', fontFamily: 'var(--font-display)', color: 'var(--accent-gold)' }}>
            💡 Pure Per-Transaction Cut · No Monthly Subscription Fee
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5 }}>
            Pactopus never charges monthly subscriptions or caps your invoice count. Standard Web users pay <strong>0.50% capped at £50 max</strong> per invoice. Verified Solana Seeker phone owners and Genesis Token holders pay <strong>0.25% capped at £5 max</strong> per invoice.
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Fee on £10,000 Seeker Invoice</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent-gold)' }}>£5.00 Max</div>
        </div>
      </div>

      {/* Agentic P2P Demo Card */}
      <div className="card" style={{ marginTop: '2.5rem', border: '1px solid rgba(var(--accent-teal-rgb), 0.28)', background: 'rgba(var(--accent-teal-rgb), 0.04)' }}>
        <h3 className="heading-md" style={{ marginBottom: '0.75rem', fontFamily: 'var(--font-display)' }}>
          🐙 Autonomous Policy &amp; Atomic Fee-Split Simulation — Freelancer ⇄ Client
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', marginBottom: '1.5rem' }}>
          Simulate the deterministic invoice verification &amp; 6-decimal integer fee-split engine between a Freelancer and Client.
        </p>

        <button
          className="btn btn-primary"
          onClick={handleRunP2PDemo}
          disabled={p2pDemoLoading}
          id="run-p2p-demo-btn"
          style={{ marginBottom: p2pDemoResult || p2pDemoError ? '1.5rem' : '0' }}
        >
          {p2pDemoLoading ? '⏳ Running simulation…' : '▶ Run Policy & Fee-Split Simulation'}
        </button>

        {p2pDemoError && (
          <div style={{ padding: '1rem 1.25rem', background: 'rgba(var(--danger-rgb), 0.08)', border: '1px solid rgba(var(--danger-rgb), 0.28)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: '0.875rem' }}>
            ❌ {p2pDemoError}
          </div>
        )}

        {p2pDemoResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span className="badge badge-green" style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                ✅ Auto-Approved ({p2pDemoResult.mode === 'policy-simulation' ? 'Policy Simulation' : 'Live'})
              </span>
              <div style={{ flex: 1, minWidth: 280, padding: '0.875rem 1rem', background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {p2pDemoResult.approvalRationale}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
              <div style={{ padding: '0.875rem 1rem', background: 'rgba(var(--success-rgb), 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(var(--success-rgb), 0.22)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>💰 Net to Freelancer</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.125rem', color: 'var(--accent-green)' }}>
                  {p2pDemoResult.payment?.netAmount}
                </div>
              </div>
              <div style={{ padding: '0.875rem 1rem', background: 'rgba(var(--accent-gold-rgb), 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(var(--accent-gold-rgb), 0.22)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>🏦 Platform Fee</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.125rem', color: 'var(--accent-gold)' }}>
                  {p2pDemoResult.payment?.feeAmount}
                </div>
              </div>
              <div style={{ padding: '0.875rem 1rem', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>📄 Invoice Amount</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.125rem', color: 'var(--text-primary)' }}>
                  {p2pDemoResult.invoice?.amount} {p2pDemoResult.invoice?.currency}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar />
      <div className="page-top" style={{ paddingTop: '8rem', paddingBottom: '4rem' }}>
        <div className="container">
          <DashboardContent />
        </div>
      </div>
    </div>
  );
}
