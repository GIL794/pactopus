'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, Suspense } from 'react';
import Navbar from '@/components/Navbar';
import PactopusLogo from '@/components/PactopusLogo';
import { useWallet } from '@/lib/wallet';

function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const styles = getComputedStyle(document.documentElement);
    const brand = styles.getPropertyValue('--brand-rgb').trim() || '153, 69, 255';
    const secondary = styles.getPropertyValue('--brand-secondary-rgb').trim() || '20, 241, 149';
    const tertiary = styles.getPropertyValue('--brand-tertiary-rgb').trim() || '0, 209, 255';

    const particles: { x: number; y: number; vx: number; vy: number; r: number; alpha: number; color: string }[] = [];
    const colors = [`rgba(${brand},`, `rgba(${secondary},`, `rgba(${tertiary},`];

    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.5 + 0.1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let animId: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}${p.alpha})`;
        ctx.fill();
      });
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(${brand},${0.06 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryNetwork = searchParams.get('network');
  const { setNetwork, network, toggleSeekerMode } = useWallet();

  useEffect(() => {
    if (queryNetwork === 'seeker' || queryNetwork === 'solana' || queryNetwork === 'arc' || queryNetwork === 'algorand') {
      setNetwork(queryNetwork);
    }
  }, [queryNetwork, setNetwork]);

  const isSeeker = network === 'seeker';

  return (
    <div style={{ minHeight: '100vh' }}>
      <a
        href="#main"
        style={{
          position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden',
        }}
        onFocus={(e) => {
          e.currentTarget.style.position = 'fixed';
          e.currentTarget.style.left = '1rem';
          e.currentTarget.style.top = '1rem';
          e.currentTarget.style.zIndex = '9999';
          e.currentTarget.style.width = 'auto';
          e.currentTarget.style.height = 'auto';
          e.currentTarget.style.overflow = 'visible';
          e.currentTarget.style.padding = '0.75rem 1.25rem';
          e.currentTarget.style.borderRadius = '16px';
          e.currentTarget.style.backgroundColor = 'var(--bg-card)';
          e.currentTarget.style.color = 'var(--text-primary)';
          e.currentTarget.style.border = '1px solid var(--brand-primary)';
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.position = 'absolute';
          e.currentTarget.style.left = '-9999px';
          e.currentTarget.style.width = '1px';
          e.currentTarget.style.height = '1px';
          e.currentTarget.style.overflow = 'hidden';
          e.currentTarget.style.padding = '0';
          e.currentTarget.style.border = 'none';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >Skip to main content</a>

      <header style={{ position: 'sticky', top: 0, zIndex: 999 }}>
        <Navbar />
      </header>

      <main id="main">

      {/* ── Hero ─────────────────────────────────────── */}
      <section style={{ position: 'relative', paddingTop: '8rem', paddingBottom: '6rem', overflow: 'hidden', minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
        <div className="hero-bg">
          <div className="hero-grid" />
          <div className="hero-glow-1" style={{ position: 'absolute', width: 700, height: 700, background: 'radial-gradient(circle, rgba(var(--brand-rgb), 0.22), transparent)', top: -200, left: '50%', transform: 'translateX(-50%)', filter: 'blur(80px)' }} />
          <div className="hero-glow-2" style={{ position: 'absolute', width: 420, height: 420, background: 'radial-gradient(circle, rgba(var(--brand-secondary-rgb), 0.18), transparent)', bottom: 0, right: 0, filter: 'blur(80px)' }} />
          <Particles />
        </div>

        <div className="container" style={{ position: 'relative', textAlign: 'center' }}>
          {/* Eyebrow Tag */}
          <div style={{ marginBottom: '1.5rem' }}>
            <span className="badge badge-cyan" style={{ border: '1px solid var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '0.12em', padding: '0.5rem 1.1rem', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                display: 'inline-block',
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: 'var(--accent-cyan)',
                boxShadow: '0 0 10px var(--accent-cyan), 0 0 20px rgba(var(--brand-rgb),0.5)',
                animation: 'pulse 1.4s cubic-bezier(.2,.8,.2,1) infinite',
              }} />
              [ {isSeeker ? 'Pactopus × Solana Seeker Hardware Mode' : 'Pactopus × Solana Standard Web'} ] — 8 arms. 0 chargebacks.
            </span>
          </div>

          {/* Kicker */}
          <div style={{ fontStyle: 'italic', fontSize: '0.78rem', letterSpacing: '0.12em', color: 'var(--accent-cyan)', marginBottom: '1rem', textTransform: 'uppercase' }}>
            Chameleon-Adaptive Solana Invoicing · Locked GBP Records · Seeker Wallet Support
          </div>

          {/* Headline */}
          <h1
            className="display-xl"
            style={{
              maxWidth: 980,
              margin: '0 auto 1.5rem',
              lineHeight: '1.12',
              textWrap: 'balance',
              scrollMarginTop: '5rem',
            }}
          >
            Solana Invoicing That Pairs With Your{' '}
            <span className="gradient-text-gold">Seeker Phone</span>.
          </h1>

          {/* Subheadline */}
          <p className="body-lg" style={{ color: 'var(--text-secondary)', maxWidth: 740, margin: '0 auto 1.75rem', lineHeight: '1.7' }}>
            Inspired by the octopus&apos;s colour-changing chromatophores, Pactopus changes its theme and fee tier when it recognises a{' '}
            <strong>Solana Seeker holder</strong>. Pay <strong>0.5% capped at £50</strong> on standard web — or unlock{' '}
            <strong>0.25% capped at £5</strong> as a verified Seeker holder. No monthly subscription fee.
          </p>

          {/* Interactive Chameleon Hardware Mode Preview Toggle */}
          <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={toggleSeekerMode}
              className="seeker-hardware-pill"
              style={{ cursor: 'pointer', padding: '0.55rem 1.15rem', fontSize: '0.82rem' }}
            >
              <span>{isSeeker ? '📱 Seeker Obsidian Theme Active (0.25% · Max £5)' : '◎ Solana Ultraviolet + Emerald Web Active (0.50% · Max £50)'}</span>
              <span style={{ opacity: 0.85, textDecoration: 'underline', marginLeft: '0.35rem' }}>
                Click to shift chameleon skin ⇄
              </span>
            </button>
          </div>

          {/* Social proof stats */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2.25rem' }}>
            {[
              { value: '0.25% / £5', label: 'Solana Seeker holder fee (0.25% per tx, hard-capped at £5 max)' },
              { value: '0.50% / £50', label: 'Standard Web fee (0.50% per tx, hard-capped at £50 max)' },
              { value: '£0 / mo', label: 'Unlimited invoices. A per-transaction fee applies when you get paid' },
              { value: 'Seconds', label: 'Atomic SPL USDC & EURC settlement with on-chain Memo + GBP FX lock' },
            ].map(stat => (
              <div key={stat.label} style={{
                textAlign: 'center',
                flex: '1 1 170px',
                padding: '1rem 0.85rem',
                borderRadius: 20,
                background: 'var(--field-bg)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}>
                <div className="mono-num" style={{ fontSize: '1.65rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--accent-cyan)' }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: 1.4 }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1rem' }}>
            <Link href="/create" className="btn btn-primary btn-lg btn-pulse" id="hero-create-invoice-btn" style={{ flex: '1 1 200px', minWidth: 0, maxWidth: 320 }}>
              🐙 Create a Solana Invoice
            </Link>
            <Link href="/onboarding" className="btn btn-secondary btn-lg" id="hero-learn-more-btn" style={{ flex: '1 1 200px', minWidth: 0, maxWidth: 320 }}>
              📱 Seeker &amp; Blinks Guide
            </Link>
          </div>
        </div>
      </section>

      {/* ── Network Settlement Capabilities Ticker ─────────────────── */}
      <div className="ticker-wrap">
        <div className="ticker-inner">
          {[
            '📱 Solana Seeker Phone — 0.25% Fee Hard-Capped at £5 Max for Seeker phone holders',
            '◎ Standard Solana Web — 0.50% Fee Hard-Capped at £50 Max · No Monthly Subscription Fee',
            '⚡ Jupiter-Style Atomic SPL Split — Payee ATA + Capped Treasury Fee + SPL Memo in 1 Tx',
            '🔗 Solana Pay QR & Shareable Solana Blinks — Pay Directly from X, Dialect, Phantom & Seeker',
            '🇬🇧 UK Accountant Ready — Locked GBP FX Valuation & 6-State On-Chain Telemetry',
            '📱 Solana Seeker Phone — 0.25% Fee Hard-Capped at £5 Max for Seeker phone holders',
            '◎ Standard Solana Web — 0.50% Fee Hard-Capped at £50 Max · No Monthly Subscription Fee',
            '⚡ Jupiter-Style Atomic SPL Split — Payee ATA + Capped Treasury Fee + SPL Memo in 1 Tx',
          ].map((item, i) => (
            <span className="ticker-item" key={i}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-green)', display: 'inline-block' }} />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── How it works ──────────────────────────────── */}
      <section style={{ padding: '6rem 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <p className="label" style={{ color: 'var(--accent-cyan)', marginBottom: '0.75rem' }}>🐙 Top Solana dApp UX</p>
            <h2 className="display-md" style={{ textWrap: 'balance', scrollMarginTop: '5rem' }}>
              Three Hearts. Eight Arms. Built Like Jupiter, Phantom &amp; Seeker.
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem', fontSize: '1rem', lineHeight: 1.7, maxWidth: 680, marginInline: 'auto' }}>
              The interface draws on patterns from across the Solana ecosystem, including route transparency, card-style wallet screens, Blinks and the Solana Seeker&apos;s industrial design.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {[
              {
                step: 'I',
                icon: '📜',
                title: 'Issue with Locked GBP Valuation',
                desc: [
                  'Set your invoice in USDC or EURC while Pactopus locks the live GBP exchange rate.',
                  'Automatic Jupiter-style route preview shows your exact net payout and the £5 / £50 fee cap.',
                  'No monthly subscription: issue as many invoices as you need.',
                ].join('\n'),
                color: 'var(--accent-cyan)',
              },
              {
                step: 'II',
                icon: '📱',
                title: 'Pay via Seeker Tap, Solana Pay QR, or Blink',
                desc: [
                  'Your client can scan the Solana Pay QR on their Seeker phone, tap a Solana Blink, or click Pay in Phantom/Solflare.',
                  'A single atomic transaction executes 99.75% (or 99.5%) to your wallet + capped fee + SPL Memo.',
                  'Deterministic reference pubkey allows instant recovery even if the browser closes mid-flight.',
                ].join('\n'),
                color: 'var(--accent-coral)',
              },
              {
                step: 'III',
                icon: '🇬🇧',
                title: '6-State Telemetry & UK GBP CSV Export',
                desc: [
                  'Track every invoice across Requested → Authorised → Submitted → Confirmed → Allocated → Accounted.',
                  'Server-side RPC verification guarantees no spoofed receipts or double-spent signatures.',
                  'Export one-click GBP-denominated CSV records ready for Xero, FreeAgent, or HMRC.',
                ].join('\n'),
                color: 'var(--accent-gold)',
              },
            ].map(item => (
              <div
                key={item.step}
                className="card"
                style={{
                  textAlign: 'left',
                  padding: '2.5rem 2rem',
                  borderRadius: 24,
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div
                      className="how-icon-circle"
                      style={{
                        width: 56, height: 56, borderRadius: '50%',
                        background: 'var(--field-bg-strong)',
                        border: '2px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.5rem',
                      }}
                    >
                      {item.icon}
                    </div>
                    <div
                      style={{
                        width: 38, height: 38, borderRadius: '50%',
                        border: '2px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 800,
                        color: 'var(--accent-cyan)',
                        fontSize: '0.85rem',
                      }}
                    >
                      {item.step}
                    </div>
                  </div>
                  <h3 className="heading-md" style={{ marginBottom: '0.75rem' }}>{item.title}</h3>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', lineHeight: 1.7 }}>
                    {item.desc.split('\n').map((bullet, bi) => (
                      <div key={bi} style={{ display: 'flex', gap: '0.5rem', marginBottom: bi < 2 ? '0.35rem' : 0 }}>
                        <span style={{ color: 'var(--accent-cyan)', flexShrink: 0 }}>•</span>
                        <span>{bullet}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Showdown Comparison: Stripe vs Standard Web vs Solana Seeker ── */}
      <section style={{ padding: '5rem 0', background: 'var(--bg-surface)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <p className="label" style={{ color: 'var(--accent-cyan)', marginBottom: '0.75rem' }}>The £5,000 Invoice Fee Example</p>
            <h2 className="display-md" style={{ textWrap: 'balance', scrollMarginTop: '5rem' }}>
              What each mode costs
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem', fontSize: '1rem' }}>
              Worked examples at the published rates. Fees are capped at £50 on Web and £5 on Seeker.
            </p>
          </div>

          <div className="compare-grid" style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1.5rem' }}>
            {/* Card 2: Pactopus Standard Web */}
            <div
              className="compare-card"
              style={{
                borderTop: '3px solid var(--brand-primary)',
                borderRadius: 24,
                padding: '2rem 1.75rem',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>◎</div>
              <h3 className="heading-md" style={{ marginBottom: '1.25rem', color: 'var(--text-primary)' }}>
                Pactopus Standard Web
              </h3>
              {[
                ['Fee Rate', '0.50% (Max £50 cap)'],
                ['Fee on £5,000 invoice', '£25.00'],
                ['Fee on £20,000 invoice', '£50.00 MAX CAP'],
                ['Monthly subscription', 'No monthly fee · Unlimited invoices'],
                ['Settlement speed', 'Seconds, atomic Solana SPL'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.7rem 0', borderBottom: '1px solid var(--border-subtle)', gap: '1rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>{k}</span>
                  <span className="mono-num" style={{ color: 'var(--text-primary)', fontSize: '0.84rem', textAlign: 'right', fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Card 3: Pactopus Solana Seeker Edition */}
            <div
              className="compare-card new"
              style={{
                borderTop: '3px solid var(--success)',
                borderRadius: 24,
                padding: '2rem 1.75rem',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid rgba(var(--brand-rgb), 0.45)',
                boxShadow: '0 12px 45px rgba(var(--brand-rgb), 0.16)',
                position: 'relative',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📱🐙</div>
              <h3 className="heading-md" style={{ marginBottom: '1.25rem', color: 'var(--accent-cyan)' }}>
                Pactopus × Solana Seeker
              </h3>
              {[
                ['Fee Rate', '0.25% (Max £5 cap)'],
                ['Fee on £5,000 invoice', '£5.00 MAX CAP'],
                ['Fee on £20,000 invoice', '£5.00 MAX CAP'],
                ['Monthly subscription', 'No monthly fee · Unlimited invoices'],
                ['Wallet', 'Solana wallets, incl. Seed Vault'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.7rem 0', borderBottom: '1px solid var(--border-subtle)', gap: '1rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>{k}</span>
                  <span className="mono-num" style={{ color: 'var(--success)', fontSize: '0.84rem', textAlign: 'right', fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Transparent Per-Transaction Fee Model (Replaces Monthly Subscriptions) ── */}
      <section style={{ padding: '5.5rem 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <p className="label" style={{ color: 'var(--accent-cyan)', marginBottom: '0.75rem' }}>🪸 No Monthly Subscription</p>
            <h2 className="display-md" style={{ textWrap: 'balance', scrollMarginTop: '5rem' }}>
              No Monthly Fee. Unlimited Invoices. Hard-Capped Per-Transaction Cut.
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem', fontSize: '1rem', maxWidth: 680, marginInline: 'auto' }}>
              We eliminated monthly SaaS subscriptions and 5-invoice quotas. Every user gets unlimited invoices, GBP accounting exports, Solana Blinks, and 6-state recovery — and only pays a micro-fee when an invoice actually settles.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.75rem', maxWidth: 920, margin: '0 auto' }}>
            {[
              {
                id: 'web',
                badge: 'STANDARD WEB MODE',
                title: 'Solana Web Platform',
                feeHeadline: '0.50%',
                capSub: 'Hard-capped at £50 max per invoice',
                tagline: 'For anyone invoicing or paying from any desktop or mobile browser without a Solana Seeker phone.',
                features: [
                  'No monthly subscription fee',
                  '0.50% (50 bps) per settled invoice, capped at £50 maximum',
                  'Any invoice over £10,000 pays a flat £50 fee',
                  'Atomic SPL USDC & EURC settlement with on-chain SPL Memo',
                  'Solana Pay QR codes, shareable Blinks & locked GBP CSV exports',
                ],
                cta: 'Create Web Invoice (0.5% · Max £50)',
                onSelect: () => {
                  setNetwork('solana');
                  router.push('/create');
                },
                highlight: false,
              },
              {
                id: 'seeker',
                badge: 'SOLANA SEEKER HARDWARE PERK',
                title: 'Solana Seeker Phone Holder',
                feeHeadline: '0.25%',
                capSub: 'Hard-capped at £5 max per invoice',
                tagline: 'Half the standard fee and a £5 cap for Solana Seeker phone holders.',
                features: [
                  'No monthly subscription fee',
                  '0.25% (25 bps) per settled invoice, capped at £5 maximum',
                  'Any invoice over £2,000 pays a flat £5 fee (0.025% on £20k!)',
                  'Chameleon UI automatically shifts to the Seeker Obsidian theme',
                  'Signs through your Solana wallet, including Seed Vault on Seeker',
                ],
                cta: 'Pair Seeker & Create Invoice (0.25% · Max £5)',
                onSelect: () => {
                  setNetwork('seeker');
                  router.push('/create');
                },
                highlight: true,
              },
            ].map(tier => (
              <div
                key={tier.id}
                className="card"
                style={{
                  padding: '2.25rem 2rem',
                  borderRadius: 26,
                  position: 'relative',
                  border: tier.highlight
                    ? '2px solid var(--accent-cyan)'
                    : '1px solid var(--border)',
                  boxShadow: tier.highlight
                    ? '0 14px 50px rgba(var(--brand-rgb), 0.20)'
                    : undefined,
                }}
              >
                <div style={{ marginBottom: '1rem' }}>
                  <span className={tier.highlight ? 'badge badge-green' : 'badge badge-cyan'} style={{ marginBottom: '0.6rem' }}>
                    {tier.highlight ? '📱 ' : '◎ '}{tier.badge}
                  </span>
                  <h3 className="heading-md" style={{ margin: '0.35rem 0 0', fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
                    {tier.title}
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', marginTop: '0.4rem', lineHeight: 1.5 }}>
                    {tier.tagline}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                  <span className="mono-num" style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                    {tier.feeHeadline}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>
                    per settled tx · £0/mo
                  </span>
                </div>
                <div className="mono-num" style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--success)', marginBottom: '1.5rem' }}>
                  ⚡ {tier.capSub}
                </div>

                <ul style={{ listStyle: 'none', marginBottom: '2rem', padding: 0 }}>
                  {tier.features.map(f => (
                    <li key={f} style={{ padding: '0.55rem 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.87rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.55rem', lineHeight: 1.45 }}>
                      <span style={{ color: 'var(--success)', flexShrink: 0, marginTop: 1 }}>✓</span> {f}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={tier.onSelect}
                  className={`btn ${tier.highlight ? 'btn-primary' : 'btn-secondary'} btn-full`}
                  id={`pricing-${tier.id}-btn`}
                >
                  {tier.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────── */}
      <section style={{ padding: '5rem 0' }}>
        <div className="container-sm" style={{ textAlign: 'center' }}>
          <div
            className="card"
            style={{
              padding: '3.5rem 2.5rem',
              borderRadius: 28,
              border: '1px solid var(--border)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🐙📱</div>
            <h2 className="display-md" style={{ marginBottom: '1rem', textWrap: 'balance' }}>
              Ready to Pair Your Invoices With Solana Seeker?
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: '1.7', maxWidth: 540, marginInline: 'auto' }}>
              Issue your first USDC or EURC invoice in 30 seconds. Share a link, Solana Blink, or Solana Pay QR code — and keep up to 99.75% with a £5 max Seeker fee cap.
            </p>
            <Link
              href="/create"
              className="btn btn-primary btn-lg btn-pulse"
              id="cta-create-invoice-btn"
            >
              🐙 Create Your First Solana Invoice →
            </Link>
          </div>
        </div>
      </section>

      </main>

      {/* ── Footer ───────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border-subtle)', padding: '2.5rem 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <PactopusLogo height={28} />
            <span style={{ color: 'var(--text-secondary)' }}>
              — Non-Custodial Solana &amp; Seeker Invoicing · A{' '}
              <a
                href="https://kyrvynltd.co.uk"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}
              >
                Kyrvyn Ltd
              </a>{' '}
              Product
            </span>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <Link href="/create" style={{ color: 'var(--text-muted)' }}>Create Invoice</Link>
            <Link href="/dashboard" style={{ color: 'var(--text-muted)' }}>Dashboard</Link>
            <Link href="/onboarding" style={{ color: 'var(--text-muted)' }}>Seeker Guide</Link>
            <a
              href="https://explorer.solana.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--text-muted)' }}
            >
              Solana Explorer ↗
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg-base)' }} />}>
      <HomeContent />
    </Suspense>
  );
}
