'use client';

import { useEffect, useRef, useState } from 'react';
import { SITE_URL } from '@/lib/site';

interface PactopusCopilotProps {
  onFillForm: (data: {
    amount: string;
    currency: 'USDC' | 'EURC';
    description: string;
    recipientAddress: string;
    recipientName: string;
  }) => void;
  currentForm: {
    amount: string;
    currency: 'USDC' | 'EURC';
    description: string;
    recipientAddress: string;
    recipientName: string;
  };
  invoiceId?: string;
}

export default function PactopusCopilot({ onFillForm, currentForm, invoiceId }: PactopusCopilotProps) {
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'parsing' | 'success'>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'copilot' | 'comms' | 'explain'>('copilot');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (intervalRef.current) clearInterval(intervalRef.current);
    setStatus('parsing');
    setLogs([]);

    const logSteps = [
      '⚡ Starting Pactopus Smart Invoice Parser…',
      '🔍 Analyzing structured billing prompt…',
      '🧩 Detecting intent: CREATE_SOLANA_INVOICE',
      '📦 Extracting amount, currency, Solana wallet & description…',
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < logSteps.length) {
        setLogs((prev: string[]) => [...prev, logSteps[currentStep]]);
        currentStep++;
      } else {
        clearInterval(interval);
        intervalRef.current = null;

        const lowercaseInput = input.toLowerCase();

        // Match Solana Base58 address (32-44 chars), EVM address (0x...), or Algorand address (58-char base32)
        const solanaMatch = input.match(/\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/);
        const evmMatch = input.match(/(0x[a-fA-F0-9]{40})/);
        const algoMatch = input.match(/\b([A-Z2-7]{58})\b/);
        const recipientAddress = evmMatch
          ? evmMatch[1]
          : algoMatch
            ? algoMatch[1]
            : solanaMatch
              ? solanaMatch[1]
              : '';

        // Strip addresses before matching numeric invoice amounts
        const strippedInput = input
          .replace(/0x[a-fA-F0-9]{40}/g, '')
          .replace(/\b[A-Z2-7]{58}\b/g, '')
          .replace(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, '');
        const amountMatch = strippedInput.match(/(\d+(?:[.,]\d{1,6})?)/);
        const amount = amountMatch ? amountMatch[1].replace(',', '.') : '';

        // Match currency
        let currency: 'USDC' | 'EURC' = 'USDC';
        if (lowercaseInput.includes('eur') || lowercaseInput.includes('eurc') || lowercaseInput.includes('euro')) {
          currency = 'EURC';
        }

        // Match description: extract after "for <non-number>"
        let description = 'Solana Seeker Engineering & Consulting';
        const forMatches = [...strippedInput.matchAll(/\bfor\s+(?!\d+(?:[.,]\d+)?\s*(?:usdc|eurc|eur|usd)\b)([^.,;]+)/gi)];
        if (forMatches.length > 0) {
          const candidate = forMatches[0][1].split(/\s+(?:to|at|address|wallet)\s+/i)[0].trim();
          if (candidate.length >= 3) {
            description = candidate.charAt(0).toUpperCase() + candidate.slice(1);
          }
        }

        // Match recipient name (look for "to [Name]" or "client [Name]" or "from [Name]")
        let recipientName = '';
        const nameMatch = strippedInput.match(/\b(?:to|client|payee|from)\s+([A-Za-z][A-Za-z0-9\s.&'-]{1,35}?)(?=\s+(?:for|at|address|wallet|\d)|$)/i);
        if (nameMatch && nameMatch[1]) {
          recipientName = nameMatch[1].trim();
        }

        onFillForm({
          amount,
          currency,
          description,
          recipientAddress,
          recipientName,
        });

        setLogs((prev: string[]) => [
          ...prev,
          `✅ Parsed parameters:`,
          `   • Amount: ${amount || 'unknown'}`,
          `   • Currency: ${currency}`,
          `   • Description: "${description}"`,
          `   • Payee / Studio: "${recipientName || 'Not specified'}"`,
          `   • Target Wallet: ${recipientAddress ? recipientAddress.slice(0, 10) + '…' : 'None detected'}`,
          `🎉 Form auto-filled successfully!`,
        ]);
        setStatus('success');
      }
    }, 350);
    intervalRef.current = interval;
  };

  // Generate billing communications based on current form
  const getCommsDrafts = () => {
    const amt = currentForm.amount || '0.00';
    const curr = currentForm.currency;
    const desc = currentForm.description || 'services rendered';
    const client = currentForm.recipientName || 'Client';

    const invoiceUrl = invoiceId ? `${SITE_URL}/pay/${invoiceId}` : `${SITE_URL}/pay/[create-invoice-to-generate-link]`;

    return {
      email: {
        subject: `Solana Pay Invoice: ${desc} (${amt} ${curr})`,
        body: `Dear ${client},\n\nI hope you are well.\n\nThis is a non-custodial Solana Pay invoice regarding: "${desc}".\n\nYou can settle this invoice directly in SPL ${curr} via Solana Seeker Seed Vault, Phantom, Solflare, or Solana Pay QR using the link below:\n👉 ${invoiceUrl}\n\nPayments settle atomically on Solana, usually within seconds, with an on-chain SPL Memo & deterministic reference key.\n\nBest regards,\n${currentForm.recipientName || 'Kyrvyn Studio'}`,
      },
      slack: `Hi ${client}, here is the Solana Pay / Blink invoice link for "${desc}" (${amt} ${curr}): ${invoiceUrl} ⚡ Thanks!`,
      whatsapp: `Hello! Here's the Solana Pay link to settle the invoice for "${desc}" (${amt} ${curr}) in SPL stablecoins: ${invoiceUrl}`,
    };
  };

  const getStablecoinExplain = () => {
    return {
      intro: 'Why Solana SPL Stablecoins + Seeker Hardware?',
      body: 'SPL USDC and EURC on Solana are regulated digital currencies pegged 1:1 to USD and EUR. Pactopus executes a single atomic Solana transaction splitting your net payout and the capped fee with an immutable SPL Memo.',
      benefits: [
        'Fast settlement: Solana payments usually confirm within seconds.',
        'Hard-capped micro-fee: Verified Solana Seeker hardware users pay 0.25% capped at £5 max; Standard Web users pay 0.50% capped at £50 max — £0/month subscription forever.',
        'Non-custodial & verifiable: Funds transfer directly from client to your SPL Associated Token Account with a deterministic reference key.',
        'UK GBP Accounting Ready: Locked GBP FX rates and 6-state lifecycle tracking export to CSV for your own bookkeeping.',
      ],
    };
  };

  const drafts = getCommsDrafts();
  const explainer = getStablecoinExplain();

  return (
    <div className="card" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', minHeight: 460, display: 'flex', flexDirection: 'column' }}>
      {/* Header Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.25rem' }}>
        {[
          { id: 'copilot' as const, label: '🧩 Smart Parser' },
          { id: 'comms' as const, label: '✉️ Billing Comms' },
          { id: 'explain' as const, label: '💡 Solana & Seeker FAQ' },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '0.75rem 0.5rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'copilot' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <p className="label" style={{ color: 'var(--accent-cyan)', marginBottom: '0.5rem' }}>Smart Invoice Parser &amp; Comms Assistant</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
            Type your billing request in plain English (supports Solana Base58 addresses). The deterministic rule-based parser extracts the amount, currency, description, and recipient to autofill your invoice.
          </p>

          <form onSubmit={handleCommandSubmit} style={{ marginBottom: '1rem' }}>
            <textarea
              className="input"
              style={{
                width: '100%',
                height: 70,
                resize: 'none',
                fontSize: '0.875rem',
                padding: '0.75rem',
                marginBottom: '0.75rem',
                background: 'var(--bg-sunken)',
              }}
              placeholder="Example: Create an invoice to Kyrvyn Studio for 2500 USDC for Solana Seeker MWA 2.0 integration at 9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
              value={input}
              onChange={e => setInput(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm btn-full"
              disabled={status === 'parsing'}
              id="autofill-billing-assistant-btn"
            >
              {status === 'parsing' ? '⚡ Parsing request…' : '🧩 Parse and Auto-fill'}
            </button>
          </form>

          {/* Terminal Console Output */}
          <div style={{
            flex: 1,
            background: '#040711',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            padding: '0.875rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: '#a5f3fc',
            overflowY: 'auto',
            maxHeight: 180,
            lineHeight: 1.5,
          }}>
            {logs.length === 0 ? (
              <span style={{ color: 'rgba(255,255,255,0.45)' }}>&gt; Smart Invoice Parser console ready...</span>
            ) : (
              logs.map((log, index) => (
                <div key={index} style={{ whiteSpace: 'pre-wrap' }}>
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'comms' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
          <p className="label" style={{ color: 'var(--accent-purple)', marginBottom: '0.25rem' }}>Client billing communication</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', lineHeight: 1.4 }}>
            Generate messages to share your Solana Pay / Blink request. Pactopus prepares these templates from your current invoice details.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', overflowY: 'auto', maxHeight: 300, paddingRight: '0.25rem' }}>
            {/* Email draft */}
            <div className="card-flat" style={{ background: 'var(--bg-sunken)', padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-purple)' }}>📧 Email Template</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '0.6875rem', padding: '2px 6px' }}
                  onClick={() => navigator.clipboard.writeText(`Subject: ${drafts.email.subject}\n\n${drafts.email.body}`)}
                >
                  Copy
                </button>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', maxHeight: 110, overflowY: 'auto', background: 'var(--bg-card)', padding: '0.5rem', borderRadius: '4px' }}>
                <strong>Subject:</strong> {drafts.email.subject}<br /><br />
                {drafts.email.body}
              </div>
            </div>

            {/* Slack draft */}
            <div className="card-flat" style={{ background: 'var(--bg-sunken)', padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>💬 Slack / Discord</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '0.6875rem', padding: '2px 6px' }}
                  onClick={() => navigator.clipboard.writeText(drafts.slack)}
                >
                  Copy
                </button>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', background: 'var(--bg-card)', padding: '0.5rem', borderRadius: '4px' }}>
                {drafts.slack}
              </div>
            </div>

            {/* Whatsapp draft */}
            <div className="card-flat" style={{ background: 'var(--bg-sunken)', padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-green)' }}>📱 WhatsApp / Telegram</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '0.6875rem', padding: '2px 6px' }}
                  onClick={() => navigator.clipboard.writeText(drafts.whatsapp)}
                >
                  Copy
                </button>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', background: 'var(--bg-card)', padding: '0.5rem', borderRadius: '4px' }}>
                {drafts.whatsapp}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'explain' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, overflowY: 'auto', maxHeight: 380 }}>
          <p className="label" style={{ color: 'var(--accent-green)', marginBottom: '0.25rem' }}>Solana SPL &amp; Seeker Hardware Guide</p>
          <h4 style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{explainer.intro}</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', lineHeight: 1.5 }}>
            {explainer.body}
          </p>
          <div className="divider" style={{ margin: '0.5rem 0' }} />
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-green)' }}>Key Benefits for You &amp; Your Client:</p>
          <ul style={{ paddingLeft: '1.25rem', margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {explainer.benefits.map((benefit, index) => (
              <li key={index} style={{ lineHeight: 1.4 }}>
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
