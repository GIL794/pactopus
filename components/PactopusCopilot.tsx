'use client';

import { useState } from 'react';
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

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setStatus('parsing');
    setLogs([]);

    const logSteps = [
      '⚡ Starting Pactopus Smart Invoice Parser…',
      '🔍 Analyzing structured billing prompt…',
      '🧩 Detecting intent: CREATE_INVOICE',
      '📦 Extracting amount, currency, wallet & description…',
    ];

    let currentStep = 0;
    const interval = setInterval(() => {
      if (currentStep < logSteps.length) {
        setLogs((prev: string[]) => [...prev, logSteps[currentStep]]);
        currentStep++;
      } else {
        clearInterval(interval);

        const lowercaseInput = input.toLowerCase();

        // Match amount (digits, optional decimals, ignoring 0x hex or long base32 addresses)
        const strippedInput = input
          .replace(/0x[a-fA-F0-9]{40}/g, '')
          .replace(/\b[A-Z2-7]{58}\b/g, '');
        const amountMatch = strippedInput.match(/(\d+(?:[.,]\d{1,6})?)/);
        const amount = amountMatch ? amountMatch[1].replace(',', '.') : '';

        // Match currency
        let currency: 'USDC' | 'EURC' = 'USDC';
        if (lowercaseInput.includes('eur') || lowercaseInput.includes('eurc') || lowercaseInput.includes('euro')) {
          currency = 'EURC';
        }

        // Match EVM address (0x...) or Algorand address (58-char base32)
        const evmMatch = input.match(/(0x[a-fA-F0-9]{40})/);
        const algoMatch = input.match(/\b([A-Z2-7]{58})\b/);
        const recipientAddress = evmMatch ? evmMatch[1] : (algoMatch ? algoMatch[1] : '');

        // Match description: extract after "for <non-number>"
        let description = 'Consulting Services';
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
          `   • Payee / Client: "${recipientName || 'Not specified'}"`,
          `   • Target Wallet: ${recipientAddress ? recipientAddress.slice(0, 10) + '…' : 'None detected'}`,
          `🎉 Form auto-filled successfully!`,
        ]);
        setStatus('success');
      }
    }, 350);
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
        subject: `Payment Request: ${desc} (${amt} ${curr})`,
        body: `Dear ${client},\n\nI hope you are well.\n\nThis is a request for payment regarding the following work: "${desc}".\n\nYou can pay this invoice securely in stablecoins using the link below:\n👉 ${invoiceUrl}\n\nStablecoin payments settle directly on-chain with transparent low fees. Please let me know if you have any questions.\n\nBest regards,\n${currentForm.recipientName || 'Kyrvyn Studio'}`,
      },
      slack: `Hi ${client}, here is the payment link for "${desc}" (${amt} ${curr}): ${invoiceUrl} ⚡ Thanks!`,
      whatsapp: `Hello! Here's the secure link to pay the invoice for "${desc}" (${amt} ${curr}) via stablecoins: ${invoiceUrl}`,
    };
  };

  const getStablecoinExplain = () => {
    return {
      intro: 'What are stablecoins?',
      body: 'Stablecoins are digital currencies pegged 1:1 to traditional fiat currencies like the US Dollar (USDC) or Euro (EURC). Unlike volatile tokens, they maintain a stable 1:1 settlement value.',
      benefits: [
        'Instant settlement: Transactions confirm on Arc (<1s) or Algorand (~1.5s).',
        'Low transparent fee: Pactopus charges 0.5% (Free), 0.4% (Pro), or 0.3% (Business) — compared to 2.9% + fixed costs on legacy card rails.',
        'Non-custodial: Payments flow directly from client to payee wallet with an atomic platform fee split.',
        'Global: Clients can pay internationally without bank delays, exchange rate surcharges, or SWIFT wire fees.',
      ],
    };
  };

  const drafts = getCommsDrafts();
  const explainer = getStablecoinExplain();

  return (
    <div className="card" style={{ background: 'rgba(13, 21, 37, 0.4)', borderColor: 'var(--border)', minHeight: 460, display: 'flex', flexDirection: 'column' }}>
      {/* Header Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.25rem' }}>
        {[
          { id: 'copilot' as const, label: '🧩 Smart Parser' },
          { id: 'comms' as const, label: '✉️ Billing Comms' },
          { id: 'explain' as const, label: '💡 Stablecoin FAQ' },
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
            Type your billing request in plain English (supports both Arc `0x…` and Algorand 58-character addresses). The rule-based parser extracts the amount, currency, description, and recipient to autofill your form.
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
                background: 'rgba(0,0,0,0.2)',
              }}
              placeholder="Example: Create an invoice to Acme Corp for 500 USDC for smart contract audit work..."
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
            border: '1px solid rgba(255,255,255,0.05)',
            padding: '0.875rem',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            color: '#a5f3fc',
            overflowY: 'auto',
            maxHeight: 180,
            lineHeight: 1.5,
          }}>
            {logs.length === 0 ? (
              <span style={{ color: 'rgba(255,255,255,0.25)' }}>&gt; Smart Invoice Parser console ready...</span>
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
            Generate messages to share your payment request. Pactopus prepares these templates from your current invoice details.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', overflowY: 'auto', maxHeight: 300, paddingRight: '0.25rem' }}>
            {/* Email draft */}
            <div className="card-flat" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem' }}>
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
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 110, overflowY: 'auto', background: 'rgba(0,0,0,0.15)', padding: '0.5rem', borderRadius: '4px' }}>
                <strong>Subject:</strong> {drafts.email.subject}<br /><br />
                {drafts.email.body}
              </div>
            </div>

            {/* Slack draft */}
            <div className="card-flat" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem' }}>
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
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', background: 'rgba(0,0,0,0.15)', padding: '0.5rem', borderRadius: '4px' }}>
                {drafts.slack}
              </div>
            </div>

            {/* Whatsapp draft */}
            <div className="card-flat" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem' }}>
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
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', background: 'rgba(0,0,0,0.15)', padding: '0.5rem', borderRadius: '4px' }}>
                {drafts.whatsapp}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'explain' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, overflowY: 'auto', maxHeight: 380 }}>
          <p className="label" style={{ color: 'var(--accent-green)', marginBottom: '0.25rem' }}>Circle Stablecoins Explanation</p>
          <h4 style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{explainer.intro}</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', lineHeight: 1.5 }}>
            {explainer.body}
          </p>
          <div className="divider" style={{ margin: '0.5rem 0' }} />
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-green)' }}>Key Benefits for your Client:</p>
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
