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
import { useQuery } from '@tanstack/react-query';
import { usePactopusAuth } from '@/lib/use-pactopus-auth';
import UpgradePlanButton from '@/components/UpgradePlanButton';

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
  const { isConnected, address, usdcBalance, eurcBalance, refreshBalances, network } = useWallet();
  const { signedFetch } = usePactopusAuth();
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [p2pDemoLoading, setP2pDemoLoading] = useState(false);
  const [p2pDemoResult, setP2pDemoResult] = useState<P2PDemoResult | null>(null);
  const [p2pDemoError, setP2pDemoError] = useState<string | null>(null);

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

  const subTier: 'free' | 'pro' | 'business' =
    stats?.tier && (stats.tier === 'free' || stats.tier === 'pro' || stats.tier === 'business')
      ? stats.tier
      : 'free';

  const handleRefresh = async () => {
    await refreshBalances();
    await refetch();
  };

  const handleExportCsv = () => {
    const invoices = stats?.recentInvoices ?? [];
    if (invoices.length === 0) return;

    const escapeCsv = (val: string | undefined) => {
      const str = (val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = ['ID', 'Description', 'Amount', 'Currency', 'Status', 'Network', 'RecipientAddress', 'RecipientName', 'CreatedAt', 'PaidAt', 'TxHash', 'Fee'];
    const rows = invoices.map((inv: Invoice) => [
      escapeCsv(inv.id),
      escapeCsv(inv.description),
      escapeCsv(inv.amount),
      escapeCsv(inv.currency),
      escapeCsv(inv.status),
      escapeCsv(inv.network),
      escapeCsv(inv.recipientAddress),
      escapeCsv(inv.recipientName),
      escapeCsv(inv.createdAt),
      escapeCsv(inv.paidAt),
      escapeCsv(inv.txHash),
      escapeCsv(inv.fee),
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pactopus-invoices-${network}-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const statusBadge = (status: Invoice['status']) => {
    if (status === 'paid') return <span className="badge badge-green">✓ Released</span>;
    if (status === 'expired') return <span className="badge badge-red">Expired</span>;
    return <span className="badge badge-cyan">Pending</span>;
  };

  if (!isConnected) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>🔌</div>
        <h2 className="heading-lg" style={{ marginBottom: '0.75rem' }}>Connect a wallet to continue</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Once you’re connected, you’ll see your invoices, payments, and balances here.
        </p>
        <button className="btn btn-primary btn-lg" onClick={() => setShowWalletModal(true)} id="dashboard-connect-btn">
          Connect wallet
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
          <p className="label" style={{ color: 'var(--accent-gold)', marginBottom: '0.25rem' }}>Overview</p>
          <h1 className="display-md" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontFamily: 'var(--font-display)', textWrap: 'balance', scrollMarginTop: '5rem' }}>
            Your invoices ({isAlgo ? 'Algorand' : 'Arc'})
            <span className={`badge ${subTier === 'free' ? 'badge-cyan' : subTier === 'pro' ? 'badge-purple' : 'badge-green'}`} style={{ textTransform: 'uppercase', fontSize: '0.75rem' }}>
              {subTier} plan
            </span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.875rem', marginTop: '0.375rem', wordBreak: 'break-all' }}>
            Wallet: {address}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {!!stats?.recentInvoices?.length && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportCsv}
              id="dashboard-export-csv-btn"
            >
              📥 Export CSV
            </button>
          )}
          <Link href="/create" className="btn btn-primary" id="dashboard-create-btn">
            New invoice
          </Link>
        </div>
      </div>

      {/* Balance tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="stat-card" style={{ border: '1px solid rgba(var(--success-rgb), 0.28)' }}>
          <div className="stat-label">💵 USDC Balance</div>
          <div className="stat-value" style={{ color: 'var(--accent-green)', marginTop: '0.5rem' }}>{usdcBalance}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>US Dollar Coin</div>
        </div>
        <div className="stat-card" style={{ border: '1px solid rgba(var(--brand-rgb), 0.28)' }}>
          <div className="stat-label">💶 EURC Balance</div>
          <div className="stat-value" style={{ color: 'var(--accent-gold)', marginTop: '0.5rem' }}>{eurcBalance}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Euro Coin</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">📈 Earned this month</div>
          <div className="stat-value gradient-text" style={{ marginTop: '0.5rem', fontSize: '1.35rem' }}>
            {isLoading
              ? '—'
              : `${parseFloat(stats?.earningsThisMonthUSDC || stats?.totalEarnedUSDC || '0').toLocaleString()} USDC`}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            {isLoading
              ? 'Loading…'
              : `+ ${parseFloat(stats?.earningsThisMonthEURC || stats?.totalEarnedEURC || '0').toLocaleString()} EURC`}
          </div>
        </div>
        <div className="stat-card" style={{ border: '1px solid rgba(var(--accent-cyan-rgb), 0.22)' }}>
          <div className="stat-label">
            {subTier === 'free' ? '📋 Invoices this month' : '📋 Total Invoices'}
          </div>
          <div className="stat-value" style={{ marginTop: '0.5rem' }}>
            {isLoading ? '—' : (subTier === 'free' ? (stats?.invoicesUsedThisMonth ?? 0) : (stats?.totalInvoices ?? 0))}
            {subTier === 'free' && !isLoading ? (
              <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                {' '}/ {stats?.invoicesAllowedThisMonth ?? 5}
              </span>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>{stats?.paidInvoices} Paid</span>
            <span className="badge badge-cyan" style={{ fontSize: '0.7rem' }}>{stats?.pendingInvoices} Pending</span>
            {subTier === 'free' && stats?.billingCycleEnd ? (
              <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>
                Resets {new Date(stats.billingCycleEnd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {subTier === 'free' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', border: '1px dashed var(--accent-gold)', borderRadius: 'var(--radius-md)', background: 'color-mix(in srgb, var(--accent-gold) 6%, transparent)', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '1.4rem' }}>⬆️</div>
          <div style={{ flex: '1 1 260px' }}>
            <div style={{ fontWeight: 700, fontFamily: 'var(--font-display)' }}>
              You’re on the FREE plan — 5 invoices / month included (0.5% fee)
            </div>
            <div style={{ fontSize: '.85rem', color: 'var(--text-secondary)', marginTop: '.25rem' }}>
              Upgrade to Pro (10,000/mo · 0.4% fee) or Business (1,000,000/mo · 0.3% fee) to unlock higher volumes and discounted platform fees.
            </div>
          </div>
          <UpgradePlanButton compact />
        </div>
      ) : null}

      {/* Network status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1.25rem', background: 'var(--field-bg)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', marginBottom: '2.5rem', flexWrap: 'wrap' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-green)', display: 'inline-block', boxShadow: '0 0 8px var(--accent-green)' }} />
        <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
          Connected to {isAlgo ? 'Algorand Testnet' : 'Arc Testnet'}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
          {isAlgo
            ? 'Quick blocks · Smooth confirmations · Colors matched to Algorand'
            : 'Fast finality · Simple fees · Colors matched to Arc'}
        </span>
        <button className="btn btn-secondary btn-sm" onClick={handleRefresh} style={{ marginLeft: 'auto' }}>
          ↻ Refresh data
        </button>
      </div>

      {/* Invoices table */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 className="heading-lg" style={{ fontFamily: 'var(--font-display)' }}>Recent invoices</h2>
          <Link href="/create" className="btn btn-secondary btn-sm" id="table-create-btn">
            New invoice
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
            <h3 className="heading-md" style={{ marginBottom: '0.5rem' }}>No active invoices</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Create one, share the link, and get paid.</p>
            <Link href="/create" className="btn btn-primary" id="empty-state-create-btn">
              Create an invoice
            </Link>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Transaction</th>
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
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
                        ID: {inv.id}
                      </div>
                    </td>
                    <td>
                      <span style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        color: inv.currency === 'USDC' ? 'var(--accent-green)' : 'var(--accent-gold)',
                        fontSize: '1rem',
                      }}>
                        {parseFloat(inv.amount).toLocaleString()}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginLeft: '0.375rem' }}>
                        {inv.currency}
                      </span>
                    </td>
                    <td>{statusBadge(inv.status)}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                      {new Date(inv.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </td>
                    <td>
                      {inv.txHash ? (
                        <a
                          href={isAlgo ? getAlgoTxLink(inv.txHash) : getTxLink(inv.txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--accent-cyan)' }}
                          id={`tx-link-${inv.id}`}
                        >
                          {inv.txHash.slice(0, 8)}…
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
          <h3 className="heading-md" style={{ marginBottom: '0.375rem', fontFamily: 'var(--font-display)', color: 'var(--accent-gold)' }}>💡 Transparent Tiered Fees</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Pactopus deducts an automatic on-chain platform fee based on your subscription tier: 0.5% on Free, 0.4% on Pro, and 0.3% on Business.
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Yearly fee savings vs 2.9%</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent-gold)' }}>1,440 USDC</div>
        </div>
      </div>

      {/* Agentic P2P Demo Card */}
      <div className="card" style={{ marginTop: '2.5rem', border: '1px solid rgba(var(--accent-teal-rgb), 0.28)', background: 'rgba(var(--accent-teal-rgb), 0.04)' }}>
        <h3 className="heading-md" style={{ marginBottom: '0.75rem', fontFamily: 'var(--font-display)' }}>
          🐙 Agentic P2P Policy &amp; Fee-Split Simulation — Freelancer ⇄ Client
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', marginBottom: '1.5rem' }}>
          Simulate the two-agent autonomous billing workflow: the Freelancer agent creates a signed invoice and the Client agent evaluates budget policy + calculates the exact 6-decimal on-chain fee split.
        </p>

        <button
          className="btn btn-primary"
          onClick={handleRunP2PDemo}
          disabled={p2pDemoLoading}
          id="run-p2p-demo-btn"
          style={{ marginBottom: p2pDemoResult || p2pDemoError ? '1.5rem' : '0' }}
        >
          {p2pDemoLoading ? '⏳ Running simulation…' : '▶ Run P2P Agent Policy Simulation'}
        </button>

        {p2pDemoError && (
          <div style={{ padding: '1rem 1.25rem', background: 'rgba(var(--danger-rgb), 0.08)', border: '1px solid rgba(var(--danger-rgb), 0.28)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: '0.875rem' }}>
            ❌ {p2pDemoError}
          </div>
        )}

        {p2pDemoResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Approval Rationale Pill */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span className="badge badge-green" style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                ✅ Auto-Approved ({p2pDemoResult.mode === 'policy-simulation' ? 'Policy Simulation' : 'Live'})
              </span>
              <div style={{ flex: 1, minWidth: 280, padding: '0.875rem 1rem', background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {p2pDemoResult.approvalRationale}
              </div>
            </div>

            {/* Agent Names */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              <div style={{ padding: '0.875rem 1rem', background: 'var(--field-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>👩‍💻 Freelancer Agent</div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p2pDemoResult.agents?.freelancer?.name}</div>
              </div>
              <div style={{ padding: '0.875rem 1rem', background: 'var(--field-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>🏢 Client Agent</div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p2pDemoResult.agents?.client?.name}</div>
              </div>
            </div>

            {/* Amounts Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
              <div style={{ padding: '0.875rem 1rem', background: 'rgba(var(--success-rgb), 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(var(--success-rgb), 0.22)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>💰 Net to Freelancer</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.125rem', color: 'var(--accent-green)' }}>
                  {p2pDemoResult.payment?.netAmount}
                </div>
              </div>
              <div style={{ padding: '0.875rem 1rem', background: 'rgba(var(--accent-gold-rgb), 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(var(--accent-gold-rgb), 0.22)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>🏦 Platform Fee (0.5%)</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.125rem', color: 'var(--accent-gold)' }}>
                  {p2pDemoResult.payment?.feeAmount}
                </div>
              </div>
              <div style={{ padding: '0.875rem 1rem', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>📄 Invoice Amount</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.125rem', color: 'var(--text-primary)' }}>
                  {p2pDemoResult.invoice?.amount} {p2pDemoResult.invoice?.currency}
                </div>
              </div>
            </div>

            {/* Tx Hashes / Links */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
              <div style={{ padding: '0.875rem 1rem', background: 'var(--field-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>🔗 Payout Digest</div>
                {p2pDemoResult.onChainLinks?.payoutTxLink ? (
                  <a
                    href={p2pDemoResult.onChainLinks.payoutTxLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--accent-cyan)', wordBreak: 'break-all' }}
                  >
                    {p2pDemoResult.payment?.payoutTxHash?.slice(0, 18)}…
                  </a>
                ) : (
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                    {p2pDemoResult.payment?.payoutTxHash?.slice(0, 18)}… (Simulated)
                  </span>
                )}
              </div>
              <div style={{ padding: '0.875rem 1rem', background: 'var(--field-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>🔗 Fee Digest</div>
                {p2pDemoResult.onChainLinks?.feeTxLink ? (
                  <a
                    href={p2pDemoResult.onChainLinks.feeTxLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--accent-cyan)', wordBreak: 'break-all' }}
                  >
                    {p2pDemoResult.payment?.feeTxHash?.slice(0, 18)}…
                  </a>
                ) : (
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                    {p2pDemoResult.payment?.feeTxHash?.slice(0, 18)}… (Simulated)
                  </span>
                )}
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
      <div style={{ paddingTop: '8rem', paddingBottom: '4rem' }}>
        <div className="container">
          <DashboardContent />
        </div>
      </div>
    </div>
  );
}
