'use client';

import { useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';

interface QuestionOption {
  label: string;
  sub: string;
  emoji: string;
  response: {
    heading: string;
    body: string;
    highlight: string;
  };
}

interface Question {
  id: number;
  emoji: string;
  question: string;
  options: QuestionOption[];
}

const QUESTIONS: Question[] = [
  {
    id: 1,
    emoji: '📱',
    question: 'Do you own a Solana Seeker phone (or hold a Seeker Genesis Token)?',
    options: [
      {
        label: 'Yes — I own a Solana Seeker / Genesis Token',
        sub: 'Using Seed Vault (MWA 2.0) or holding Chapter 2 / Genesis NFT',
        emoji: '⚡',
        response: {
          heading: 'Biometric Emerald Mode Unlocked: 0.25% Capped at £5 Max!',
          body: 'Like an octopus adapting its chromatophores to its environment, Pactopus automatically shifts its entire UI palette, theme, and fee engine into the Seeker theme when you connect.',
          highlight: 'Your transaction fee is cut in half to 0.25% and hard-capped at £5 max — so a £10,000 agency retainer costs just £5 total.',
        },
      },
      {
        label: 'No — I use Phantom, Solflare, or Backpack on Web/Mobile',
        sub: 'Standard Solana browser extension or mobile wallet',
        emoji: '◎',
        response: {
          heading: 'Solana Web Mode: 0.50% Capped at £50 Max · No Monthly Subscription Fee!',
          body: 'You get full access to unlimited Solana Pay invoices, Shareable Blinks, 6-state settlement telemetry, and UK GBP accounting exports with zero monthly subscription.',
          highlight: 'Your fee is 0.50% per settled invoice, hard-capped at £50 max.',
        },
      },
      {
        label: 'New to Solana & SPL Stablecoins',
        sub: 'Exploring non-custodial USDC and EURC invoicing',
        emoji: '🆕',
        response: {
          heading: 'Welcome — Solana SPL Stablecoins Settle in Seconds!',
          body: 'SPL USDC ($1) and EURC (€1) are regulated digital currencies pegged 1:1 to fiat. Unlike volatile crypto, they hold stable value and move directly to your wallet in under half a second.',
          highlight: 'Install Phantom or connect a Solana Seeker phone in 2 minutes — Pactopus never holds custody of your funds.',
        },
      },
    ],
  },
  {
    id: 2,
    emoji: '📋',
    question: 'What is your typical invoice size for clients?',
    options: [
      {
        label: 'High-ticket retainers (£2,000 – £20,000+)',
        sub: 'Agency sprints, engineering retainers, or advisory milestones',
        emoji: '🏛️',
        response: {
          heading: 'The £5 Seeker Cap & £50 Web Cap Are Built for You!',
          body: 'Fees are a percentage of each settled invoice, with a fixed ceiling so large invoices stop costing more.',
          highlight: 'On Pactopus, Seeker Mode caps your fee at £5 on anything above £2,000, and Web Mode caps your fee at £50 on anything above £10,000.',
        },
      },
      {
        label: 'Mid-sized freelance invoices (£250 – £2,000)',
        sub: 'Design deliverables, audits, and weekly billing',
        emoji: '💼',
        response: {
          heading: 'Keep 99.5% to 99.75% of Every Invoice!',
          body: 'With £0/month subscription and unlimited invoices, you never pay for idle months. A £1,000 invoice costs just £2.50 in Seeker Mode or £5.00 in Web Mode.',
          highlight: 'Funds settle atomically into your wallet within seconds — no 3–5 business day bank holds.',
        },
      },
      {
        label: 'Micro-milestones & frequent payouts (£50 – £250)',
        sub: 'Rapid task billing and international contractor work',
        emoji: '⚡',
        response: {
          heading: 'No Fixed 30p Card Surcharges or £25 SWIFT Wire Fees!',
          body: 'Solana network fees are ~$0.00025, making micro-invoicing and milestone-by-milestone releases completely economical across borders.',
          highlight: 'Every payment carries an immutable SPL Memo and deterministic Reference Key for instant verification.',
        },
      },
    ],
  },
  {
    id: 3,
    emoji: '🧾',
    question: 'How do you handle accounting and payment verification?',
    options: [
      {
        label: 'I need UK GBP records for my accountant / HMRC',
        sub: 'Clear GBP gross, fee, net, and FX rate records',
        emoji: '🇬🇧',
        response: {
          heading: 'Locked GBP FX Valuation + 1-Click Accountant CSV Export!',
          body: 'A raw blockchain hash is not a business record. Pactopus locks the GBP exchange rate at invoicing/settlement and tracks Gross GBP, Capped Fee GBP, and Net GBP.',
          highlight: 'Export your ledger from the Dashboard in one click with SPL Memos, Reference Keys, and Solana signatures included.',
        },
      },
      {
        label: 'Clients sometimes pay from mobile QR or close their browser tab',
        sub: 'Need reliable recovery if a tab closes mid-checkout',
        emoji: '🔄',
        response: {
          heading: '6-State Telemetry + On-Chain Reference Key Recovery!',
          body: 'Every Pactopus invoice derives a unique Solana Pay Reference Public Key and SPL Memo (`PACTOPUS:INV:<id>`). Even if a client pays from another device, Pactopus finds and reconciles it on-chain.',
          highlight: 'Track every invoice across Requested → Authorised → Submitted → Confirmed → Allocated → Accounted.',
        },
      },
      {
        label: 'I want clients to pay with zero friction',
        sub: 'One-tap Solana Pay QR, Blinks, or Mobile Wallet Adapter',
        emoji: '📲',
        response: {
          heading: 'Solana Pay QR + Shareable Blinks Built Into Every Link!',
          body: 'Your `/pay/[id]` link automatically serves a Solana Pay Transaction Request and Dialect-compatible Solana Action / Blink so clients can approve the atomic split in one tap.',
          highlight: 'Both your net payout and the capped Pactopus fee settle in a single atomic Solana transaction.',
        },
      },
    ],
  },
];

function OnboardingContent() {
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);

  const question = QUESTIONS[currentQ];
  const progress = (currentQ / QUESTIONS.length) * 100;

  const handleSelect = (idx: number) => {
    setSelected(idx);
  };

  const handleNext = () => {
    if (selected === null) return;
    setAnswers((prev: number[]) => [...prev, selected]);
    if (currentQ < QUESTIONS.length - 1) {
      setCurrentQ((prev: number) => prev + 1);
      setSelected(null);
    } else {
      setCompleted(true);
    }
  };

  if (completed) {
    return (
      <div style={{ minHeight: '100vh' }}>
        <Navbar />
        <div className="page-top" style={{ paddingTop: '8rem', paddingBottom: '4rem' }}>
          <div className="container-sm" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🐙</div>
            <h1 className="display-md" style={{ marginBottom: '1rem', fontFamily: 'var(--font-display)' }}>
              You’re Ready for <span className="gradient-text-gold">Pactopus on Solana</span>!
            </h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', fontSize: '1.0625rem', lineHeight: 1.6 }}>
              Your adaptive Octopus Chameleon workspace is configured for <strong>Solana Web (0.5% · £50 Max Cap)</strong> and <strong>verified Seeker payer (0.25% · £5 Max Cap)</strong> with unlimited £0/month invoicing.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/create" className="btn btn-primary btn-lg btn-pulse" id="onboarding-complete-create-btn">
                Create Your First Solana Invoice →
              </Link>
              <Link href="/dashboard" className="btn btn-secondary btn-lg">
                Open GBP Dashboard
              </Link>
            </div>

            {/* Summary of what they told us */}
            <div className="card" style={{ marginTop: '3rem', textAlign: 'left', borderTop: '3px solid var(--accent-gold)' }}>
              <h3 className="heading-md" style={{ marginBottom: '1.25rem', fontFamily: 'var(--font-display)', color: 'var(--accent-gold)' }}>
                Your Tailored Pactopus Configuration
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {answers.map((ansIdx: number, qIdx: number) => {
                  const opt = QUESTIONS[qIdx].options[ansIdx];
                  return (
                    <div key={qIdx} style={{ paddingLeft: '1rem', borderLeft: '2px solid var(--accent-gold)' }}>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Step {qIdx + 1}: {QUESTIONS[qIdx].question}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: '0.5rem' }}>
                        Selected: {opt.label}
                      </div>
                      <h4 style={{ color: 'var(--accent-gold)', fontSize: '1rem', fontWeight: 600, marginBottom: '0.375rem', fontFamily: 'var(--font-display)' }}>
                        {opt.response.heading}
                      </h4>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '0.5rem' }}>
                        {opt.response.body}
                      </p>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                        💡 {opt.response.highlight}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const selectedOpt = selected !== null ? question.options[selected] : null;

  return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar />
      <div className="page-top" style={{ paddingTop: '8rem', paddingBottom: '4rem' }}>
        <div className="container-md">
          {/* Progress bar */}
          <div style={{ marginBottom: '3rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              <span>Octopus Chameleon · Solana &amp; Seeker Setup</span>
              <span>Step {currentQ + 1} of {QUESTIONS.length}</span>
            </div>
            <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: '2px' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent-gold)', transition: 'width 0.4s ease', borderRadius: '2px' }} />
            </div>
          </div>

          <div className="onboarding-grid">
            {/* Left side: Question & Options */}
            <div>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>{question.emoji}</div>
              <h2 className="heading-lg" style={{ marginBottom: '2rem' }}>{question.question}</h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {question.options.map((opt, idx) => (
                  <button
                    key={opt.label}
                    className={`btn btn-full ${selected === idx ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handleSelect(idx)}
                    style={{ textAlign: 'left', display: 'flex', gap: '1rem', alignItems: 'center', padding: '1.25rem', whiteSpace: 'normal' }}
                    id={`onboarding-q${question.id}-opt${idx}-btn`}
                  >
                    <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{opt.emoji}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{opt.label}</div>
                      <div style={{ fontSize: '0.8125rem', color: selected === idx ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)', marginTop: '0.125rem' }}>
                        {opt.sub}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <button
                className="btn btn-primary btn-full btn-lg"
                style={{ marginTop: '2rem' }}
                onClick={handleNext}
                disabled={selected === null}
                id="onboarding-next-btn"
              >
                {currentQ === QUESTIONS.length - 1 ? 'Complete Setup' : 'Next Question →'}
              </button>
            </div>

            {/* Right side: Adaptive Explainer Box */}
            <div className="onboarding-explainer">
              {selectedOpt ? (
                <div className="card fade-in" style={{ borderColor: 'var(--accent-gold)', borderTop: '3px solid var(--accent-gold)' }}>
                  <p className="label" style={{ color: 'var(--accent-gold)', marginBottom: '0.75rem' }}>Solana &amp; Seeker Architecture</p>
                  <h3 className="heading-md" style={{ color: 'var(--accent-gold)', marginBottom: '0.75rem', fontFamily: 'var(--font-display)' }}>
                    {selectedOpt.response.heading}
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                    {selectedOpt.response.body}
                  </p>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'start', padding: '1rem', background: 'rgba(var(--brand-rgb), 0.10)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(var(--brand-rgb), 0.22)', color: 'var(--accent-gold)', fontSize: '0.875rem', fontWeight: 500 }}>
                    <span style={{ fontSize: '1.125rem' }}>💡</span>
                    <div>{selectedOpt.response.highlight}</div>
                  </div>
                </div>
              ) : (
                <div className="card" style={{ borderStyle: 'dashed', border: '1px dashed var(--accent-gold)', textAlign: 'center', padding: '4rem 2rem' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.5 }}>👈</div>
                  <h3 className="heading-md" style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontFamily: 'var(--font-display)' }}>Select an Option</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    Choose an answer on the left to see how Pactopus adapts its fees, caps, and settlement telemetry to your workflow.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return <OnboardingContent />;
}
