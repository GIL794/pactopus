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
    emoji: '💵',
    question: 'Are you familiar with stablecoins (like USDC or EURC)?',
    options: [
      {
        label: 'Yes, I know what they are',
        sub: "I've used or researched crypto",
        emoji: '👍',
        response: {
          heading: "Great, you're ahead of the game!",
          body: 'Stablecoins like USDC and EURC are pegged 1:1 to fiat currencies — so 1 USDC always equals $1, and 1 EURC always equals €1. No price volatility, no surprises.',
          highlight: 'Pactopus uses USDC and EURC - trusted stablecoins that move through an interface tailored to the chain your client is using.',
        },
      },
      {
        label: "I've heard the term but unsure",
        sub: 'Seen it in the news or social media',
        emoji: '🤔',
        response: {
          heading: 'Good news — stablecoins are simpler than you think!',
          body: 'Unlike Bitcoin or Ethereum, stablecoins don\'t go up and down in price. USDC is always $1. EURC is always €1. Think of them as "digital dollars" or "digital euros" that move at internet speed.',
          highlight: 'They combine the stability of your bank account with the speed of the internet, and Pactopus wraps them in a chain-aware experience.',
        },
      },
      {
        label: 'Never heard of them',
        sub: 'New to this space',
        emoji: '🆕',
        response: {
          heading: 'Welcome — you\'re in exactly the right place!',
          body: 'Stablecoins are a type of digital currency that are designed to stay stable in value. USDC = 1 US Dollar, always. EURC = 1 Euro, always. You can send them anywhere in the world, instantly, for almost zero cost.',
          highlight: 'No price risk. No bank delays. Just fast, stable money - accessible to anyone.',
        },
      },
    ],
  },
  {
    id: 2,
    emoji: '📋',
    question: 'Do you currently invoice clients for your work?',
    options: [
      {
        label: 'Yes, regularly',
        sub: 'Monthly or more frequent',
        emoji: '✅',
        response: {
          heading: 'Then Pactopus will secure your payments!',
          body: 'If you invoice £5,000/month and use Stripe or PayPal, you\'re paying ~£145 in fees and waiting 3-5 days. Pactopus charges 0.5% (£25) and settles in under 1 second.',
          highlight: 'That\'s £120 saved every month — £1,440 per year — back in your pocket.',
        },
      },
      {
        label: 'Sometimes / occasionally',
        sub: 'A few times a year',
        emoji: '📅',
        response: {
          heading: 'Every invoice matters — even occasional ones!',
          body: 'When you do send an invoice, Pactopus means you receive payment the same day — not in a week. Your client saves on FX fees too, especially if they\'re paying in a different currency.',
          highlight: 'The smaller the invoice, the more a 0.5% fee beats traditional 2.9% + fixed costs.',
        },
      },
      {
        label: 'Not yet — I\'m just exploring',
        sub: 'Thinking about going freelance',
        emoji: '🌱',
        response: {
          heading: 'Starting on the right foot — smart move!',
          body: 'Setting up stablecoin payments from day one means you\'re ready for global clients without friction. Many modern businesses prefer on-chain invoices for speed and clean receipts.',
          highlight: 'Start with Pactopus, and you\'ll never have to worry about "when does the bank transfer arrive?"',
        },
      },
    ],
  },
  {
    id: 3,
    emoji: '🌐',
    question: 'Where are your clients based?',
    options: [
      {
        label: 'Mostly in my country',
        sub: 'Same currency, same country',
        emoji: '🏠',
        response: {
          heading: 'Stablecoins still beat local bank transfers!',
          body: 'Even for domestic payments, stablecoins settle instantly (vs. 1-3 days for BACS/SEPA), cost less in fees, and give you a permanent on-chain receipt — great for accounting.',
          highlight: 'Many UK freelancers use USDC to invoice UK clients for the speed alone.',
        },
      },
      {
        label: 'Mix of countries',
        sub: 'EU, US, and others',
        emoji: '🌍',
        response: {
          heading: 'This is where Pactopus truly shines!',
          body: 'Cross-border stablecoin payments avoid FX conversion fees, SWIFT fees (£25-50 per wire), and delays. A client in Germany pays you in EURC. A client in the US pays in USDC. Both land in your wallet instantly.',
          highlight: 'No currency conversion surprises. No "where\'s my payment?" chases.',
        },
      },
      {
        label: 'Mostly international',
        sub: 'USA, Asia, Middle East, etc.',
        emoji: '✈️',
        response: {
          heading: 'You\'re going to love stablecoins!',
          body: 'International wires can take 5-7 days and cost £30-100 in fees each way. With Pactopus, any client globally can pay you in USDC in under 1 second — and it\'s irreversible (no chargebacks).',
          highlight: 'Pactopus is built for the global creator economy. This is your payments infrastructure.',
        },
      },
    ],
  },
  {
    id: 4,
    emoji: '🚀',
    question: 'What are you most excited about?',
    options: [
      {
        label: 'Getting paid faster',
        sub: 'No more waiting for bank transfers',
        emoji: '⚡',
        response: {
          heading: 'Instant settlement is our superpower!',
          body: 'With Arc blockchain powering Pactopus, payments confirm in under 1 second. The moment your client clicks "Pay", the stablecoins are in your wallet. No pending state. No "allow 3-5 working days."',
          highlight: 'Send an invoice at 11pm on a Friday. Get paid before midnight.',
        },
      },
      {
        label: 'Paying lower fees',
        sub: 'Stripe and PayPal take too much',
        emoji: '💰',
        response: {
          heading: 'Your money should stay yours!',
          body: 'At £5,000/month invoiced, you save £1,440/year vs Stripe. At £20,000/month, that\'s £5,760/year. The math is simple: 0.5% beats 2.9% every time.',
          highlight: 'Pactopus\'s 0.5% fee is transparent, fixed, and deducted automatically. No hidden charges.',
        },
      },
      {
        label: 'Working with global clients',
        sub: 'No borders, no FX headaches',
        emoji: '🌐',
        response: {
          heading: 'The internet has no borders — your payments shouldn\'t either!',
          body: 'Stablecoins are the first truly global payment rails. No IBAN. No SWIFT. No "what bank do you use?" Your payment link works for every client everywhere, 24/7.',
          highlight: 'A Tokyo client, a New York agency, a Lagos startup — one payment link handles them all.',
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
        <div style={{ paddingTop: '8rem', paddingBottom: '4rem' }}>
          <div className="container-sm" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🎉</div>
            <h1 className="display-md" style={{ marginBottom: '1rem', fontFamily: 'var(--font-display)' }}>
              You are ready to use <span className="gradient-text-gold">Pactopus</span>!
            </h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', fontSize: '1.0625rem' }}>
              You now understand why Pactopus exists, how stablecoins can transform your freelance agreements, and how the octopus-inspired workspace adapts to Arc or Algorand in milliseconds. Let us create your first invoice - it takes about 30 seconds.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/create" className="btn btn-primary btn-lg btn-pulse" id="onboarding-complete-create-btn">
                Create Your First Invoice →
              </Link>
              <Link href="/" className="btn btn-ghost btn-lg">
                Back to Home
              </Link>
            </div>

            {/* Summary of what they told us */}
            <div className="card" style={{ marginTop: '3rem', textAlign: 'left', borderTop: '3px solid var(--accent-gold)' }}>
              <h3 className="heading-md" style={{ marginBottom: '1.25rem', fontFamily: 'var(--font-display)', color: 'var(--accent-gold)' }}>Your Responses</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {answers.map((ansIdx: number, qIdx: number) => {
                  const opt = QUESTIONS[qIdx].options[ansIdx];
                  return (
                    <div key={qIdx} style={{ paddingLeft: '1rem', borderLeft: '2px solid var(--accent-gold)' }}>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Question {qIdx + 1}: {QUESTIONS[qIdx].question}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: '0.5rem' }}>
                        Affirmed: {opt.label}
                      </div>
                      <h4 style={{ color: 'var(--accent-gold)', fontSize: '1rem', fontWeight: 600, marginBottom: '0.375rem', fontFamily: 'var(--font-display)' }}>
                        {opt.response.heading}
                      </h4>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '0.5rem' }}>
                        {opt.response.body}
                      </p>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--accent-gold)', fontWeight: 500 }}>
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
      <div style={{ paddingTop: '8rem', paddingBottom: '4rem' }}>
        <div className="container-md">
          {/* Progress bar */}
          <div style={{ marginBottom: '3rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              <span>Octopus Setup</span>
              <span>Step {currentQ + 1} of {QUESTIONS.length}</span>
            </div>
            <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: '2px' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent-gold)', transition: 'width 0.4s ease', borderRadius: '2px' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: '3rem', alignItems: 'start' }}>
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
                    style={{ textAlign: 'left', display: 'flex', gap: '1rem', alignItems: 'center', padding: '1.25rem' }}
                    id={`onboarding-q${question.id}-opt${idx}-btn`}
                  >
                    <span style={{ fontSize: '1.5rem' }}>{opt.emoji}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{opt.label}</div>
                      <div style={{ fontSize: '0.8125rem', color: selected === idx ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)', marginTop: '0.125rem' }}>
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
            <div style={{ position: 'sticky', top: '10rem' }}>
              {selectedOpt ? (
                <div className="card fade-in" style={{ borderColor: 'var(--accent-gold)', borderTop: '3px solid var(--accent-gold)' }}>
                  <p className="label" style={{ color: 'var(--accent-gold)', marginBottom: '0.75rem' }}>explainer</p>
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
                  <h3 className="heading-md" style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontFamily: 'var(--font-display)' }}>Select an Answer</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    Select an option on the left to see dynamic explainer content adapted to your experience level and the Pactopus payment model.
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
