'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, Suspense } from 'react';
import Navbar from '@/components/Navbar';
import PactopusLogo from '@/components/PactopusLogo';
import { useWallet } from '@/lib/wallet';
import SubscriptionModal from '@/components/SubscriptionModal';
import WorkspaceOverlay from '@/components/WorkspaceOverlay';
import SavingsHeroSlider from '@/components/SavingsHeroSlider';
import { useQuery } from '@tanstack/react-query';

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
    const brand = styles.getPropertyValue('--brand-rgb').trim() || '255, 182, 72';
    const secondary = styles.getPropertyValue('--brand-secondary-rgb').trim() || '224, 90, 79';
    const tertiary = styles.getPropertyValue('--brand-tertiary-rgb').trim() || '64, 32, 58';

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
  const { setNetwork, network } = useWallet();

  const [showSubModal, setShowSubModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<{ plan: 'free' | 'pro' | 'business', price: string } | null>(null);
  const subModalTriggerRef = useRef<HTMLButtonElement>(null);

  const { data: extensions } = useQuery({
    queryKey: ['injectedWallets'],
    queryFn: async () => {
      if (typeof window === 'undefined') return { evm: false, algo: false };
      const win = window as unknown as { algo?: unknown };
      const evm = !!window.ethereum;
      const algo = !!window.algorand || !!win.algo;
      return { evm, algo };
    },
    staleTime: Infinity,
  });

  const hasSynced = useRef(false);
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !extensions || hasSynced.current) return;
    hasSynced.current = true;

    if (queryNetwork === 'algorand') {
      setNetwork('algorand');
      return;
    } else if (queryNetwork === 'arc') {
      setNetwork('arc');
      return;
    }

    // 2. Check for explicit saved preference
    const savedPref = localStorage.getItem('pactopus_network');
    if (savedPref === 'arc' || savedPref === 'algorand') {
      setNetwork(savedPref);
      return;
    }

    // 3. Check for active saved session
    const saved = localStorage.getItem('pactopus_wallet');
    if (saved) {
      try {
        const { network: savedNet } = JSON.parse(saved);
        if (savedNet === 'arc' || savedNet === 'algorand') {
          setNetwork(savedNet);
          return;
        }
      } catch { /* ignore */ }
    }

    // 4. Fallback to extension detection logic
    if (extensions.algo && !extensions.evm) {
      setNetwork('algorand');
    } else if (extensions.evm && !extensions.algo) {
      setNetwork('arc');
    }
  }, [extensions, queryNetwork, setNetwork]);

  const handleWorkspaceChoice = (chosenNetwork: 'arc' | 'algorand') => {
    setNetwork(chosenNetwork);
    setShowOverlay(false);
  };

  const handlePlanClick = (plan: 'free' | 'pro' | 'business', price: string) => {
    if (plan === 'free') {
      router.push('/create');
    } else {
      setSelectedPlan({ plan, price });
      setShowSubModal(true);
    }
  };

  const handleSubSuccess = () => {
    setShowSubModal(false);
    router.push('/create?sub_active=true');
  };

  const isAlgo = network === 'algorand';

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
          e.currentTarget.style.border = '1px solid var(--brand)';
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
          <div className="hero-glow-1" style={{ position: 'absolute', width: 700, height: 700, background: 'radial-gradient(circle, rgba(var(--brand-rgb), 0.20), transparent)', top: -200, left: '50%', transform: 'translateX(-50%)', filter: 'blur(80px)' }} />
          <div className="hero-glow-2" style={{ position: 'absolute', width: 400, height: 400, background: 'radial-gradient(circle, rgba(var(--brand-secondary-rgb), 0.16), transparent)', bottom: 0, right: 0, filter: 'blur(80px)' }} />
          <Particles />
        </div>

        <div className="container" style={{ position: 'relative', textAlign: 'center' }}>
          {/* Eyebrow Tag */}
          <div style={{ marginBottom: '1.5rem' }}>
            <span className="badge badge-cyan" style={{ border: '1px solid var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '0.12em', padding: '0.5rem 1rem', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                display: 'inline-block',
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: 'var(--accent-gold)',
                boxShadow: '0 0 10px var(--accent-gold), 0 0 20px rgba(var(--brand-rgb),0.5)',
                animation: 'pulse 1.4s cubic-bezier(.2,.8,.2,1) infinite',
              }} />
              [ {isAlgo ? 'Pactopus for Algorand' : 'Pactopus for Arc'} ] — 8 arms. 1 invoice.
            </span>
          </div>

          {/* Latin Legal Accent */}
          <div style={{ fontStyle: 'italic', fontSize: '0.75rem', letterSpacing: '0.12em', color: 'var(--accent-gold)', marginBottom: '1rem', textTransform: 'uppercase' }}>
            Ink-redible invoicing. Seriously final settlement.
          </div>

          {/* Headline */}
          <h1
            className="display-xl"
            style={{
              maxWidth: 950,
              margin: '0 auto 1.5rem',
              lineHeight: '1.15',
              textWrap: 'balance',
              scrollMarginTop: '5rem',
            }}
          >
            Send Invoices.<br />
            Tentacles Adapt in <span className="gradient-text-gold">Milliseconds</span>.
          </h1>

          {/* Subheadline */}
          <p className="body-lg" style={{ color: 'var(--text-secondary)', maxWidth: 680, margin: '0 auto 2rem', lineHeight: '1.7' }}>
            Pactopus shifts colors faster than a reef octopus spotting a predator — one millisecond it&apos;s {isAlgo ? 'teal-for-Algorand' : 'mango-for-Arc'}, the next it&apos;s ready to get you paid. Build an invoice, drop a link, and watch your USDC swim home.
          </p>

          <div style={{ marginBottom: '2rem' }}>
            <span className="badge badge-cyan" style={{ padding: '0.6rem 1rem', fontSize: '0.78rem', letterSpacing: '0.04em' }}>
              {isAlgo
                ? '🌊 Algorand workspace — ocean teal + deep green camouflage active.'
                : '🌅 Arc workspace — warm mango + coral camouflage active.'}
            </span>
          </div>

          {/* Social proof stats — BEFORE the savings calculator, so trust comes first */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2.25rem' }}>
            {[
              { value: isAlgo ? '1.5s' : '<1s', label: isAlgo ? 'Block finality (faster than you can say "cephalopod")' : 'Instant finality (faster than ink can dry)' },
              { value: '0.3–0.5%', label: 'Tiered platform fee (vs 2.9% Stripe — your wallet thanks all 3 hearts)' },
              { value: '£0', label: 'Monthly base cost on Solo Tide (zero tentacle tax)' },
              { value: '6×', label: 'Cheaper than bank wires (and way fewer tentacles involved)' },
            ].map(stat => (
              <div key={stat.label} style={{
                textAlign: 'center',
                flex: '1 1 150px',
                padding: '1rem 0.75rem',
                borderRadius: 20,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--accent-gold)' }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.35rem', lineHeight: 1.4 }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Savings calculator — positioned DIRECTLY above the CTA button (F-pattern: trust → calculate → act) */}
          <SavingsHeroSlider />

          {/* CTAs */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1rem' }}>
            <Link href="/create" className="btn btn-primary btn-lg btn-pulse" id="hero-create-invoice-btn" style={{ flex: '1 1 200px', minWidth: 0, maxWidth: 320 }}>
              🐙 Create an invoice
            </Link>
            <Link href="/onboarding" className="btn btn-secondary btn-lg" id="hero-learn-more-btn" style={{ flex: '1 1 200px', minWidth: 0, maxWidth: 320 }}>
              📚 See how it works
            </Link>
          </div>
        </div>
      </section>

      {/* ── Network Settlement Capabilities Ticker ─────────────────── */}
      <div className="ticker-wrap">
        <div className="ticker-inner">
          {isAlgo ? (
            [
              '⚡ Algorand Testnet — 2-Transfer Atomic ASA Group Settlement',
              '💵 USDC (ASA 10458941) — 6-Decimal Precision Verification',
              '💶 EURC (ASA 230190169) — Non-Custodial Wallet-to-Wallet Payout',
              '🛡️ Ed25519 Signed Nonce Auth — Replay-Protected API Writes',
              '⚡ Algorand Testnet — 2-Transfer Atomic ASA Group Settlement',
              '💵 USDC (ASA 10458941) — 6-Decimal Precision Verification',
              '💶 EURC (ASA 230190169) — Non-Custodial Wallet-to-Wallet Payout',
              '🛡️ Ed25519 Signed Nonce Auth — Replay-Protected API Writes',
            ].map((item, i) => (
              <span className="ticker-item" key={i}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-green)', display: 'inline-block' }} />
                {item}
              </span>
            ))
          ) : (
            [
              '⚡ Arc L1 Testnet — Server-Verified ERC-20 Settlement',
              '💵 USDC & 💶 EURC — Direct Payee + Platform Fee Split',
              '🤖 HTTP 402 Nanopayment Challenge — Autonomous Agent Billing',
              '🛡️ EIP-191 Signed Nonce Auth — Replay-Protected API Writes',
              '⚡ Arc L1 Testnet — Server-Verified ERC-20 Settlement',
              '💵 USDC & 💶 EURC — Direct Payee + Platform Fee Split',
              '🤖 HTTP 402 Nanopayment Challenge — Autonomous Agent Billing',
              '🛡️ EIP-191 Signed Nonce Auth — Replay-Protected API Writes',
            ].map((item, i) => (
              <span className="ticker-item" key={i}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-green)', display: 'inline-block' }} />
                {item}
              </span>
            ))
          )}
        </div>
      </div>

      {/* ── How it works ──────────────────────────────── */}
      <section style={{ padding: '6rem 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <p className="label" style={{ color: 'var(--accent-gold)', marginBottom: '0.75rem' }}>🐙 How it works</p>
            <h2 className="display-md" style={{ textWrap: 'balance', scrollMarginTop: '5rem' }}>Three Hearts. Eight Arms. One Killer Flow.</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem', fontSize: '1rem', lineHeight: 1.7, maxWidth: 620, marginInline: 'auto' }}>
              Three hearts. One for you. One for your client. One to keep blocks finalizing fast.<br />
              Pactopus juggles the chains so you don&apos;t have to — every tentacle doing exactly what it does best.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {[
              {
                step: 'I',
                icon: '📜',
                title: 'Draft your invoice',
                desc: [
                  `Add the amount, a clear description, and your wallet.`,
                  `Pactopus has already camouflaged itself for ${isAlgo ? 'Algorand' : 'Arc'} — no setup required.`,
                  `Save 3 clicks. Save 30 seconds. Feed all 3 hearts.`,
                ].join('\n'),
                color: 'var(--accent-gold)',
              },
              {
                step: 'II',
                icon: '🔗',
                title: 'Share the ink-link',
                desc: [
                  `Drop the payment link anywhere — email, Slack, or Telegram.`,
                  `Your client lands on a branded, clean page that matches the chain.`,
                  `They click Pay. You sit back. Tentacles do the rest.`,
                ].join('\n'),
                color: 'var(--accent-red)',
              },
              {
                step: 'III',
                icon: '💸',
                title: 'Get paid in seconds',
                desc: [
                  `One wallet confirmation, done.`,
                  `Settles on ${isAlgo ? 'Algorand' : 'Arc'} faster than a startled octopus jets.`,
                  `No chargebacks. No surprises. Just settled funds.`,
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
                  backgroundImage: `linear-gradient(180deg, ${item.color}10 0%, rgba(255,255,255,0.02) 100%)`,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 40px rgba(0,0,0,0.3)',
                  border: `1px solid ${item.color}22`,
                  transition: 'transform 220ms cubic-bezier(.2,.8,.2,1), box-shadow 220ms ease, border-color 220ms ease',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.transform = 'translateY(-6px)';
                  el.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 50px rgba(0,0,0,0.4)';
                  el.style.borderBottom = `3px solid ${item.color}`;
                  const icon = el.querySelector('.how-icon-circle') as HTMLDivElement | null;
                  if (icon) icon.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.transform = 'translateY(0)';
                  el.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 40px rgba(0,0,0,0.3)';
                  el.style.borderBottom = `1px solid ${item.color}22`;
                  const icon = el.querySelector('.how-icon-circle') as HTMLDivElement | null;
                  if (icon) icon.style.transform = 'scale(1)';
                }}
              >
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div
                      className="how-icon-circle"
                      style={{
                        width: 56, height: 56, borderRadius: '50%',
                        background: `${item.color}18`,
                        border: `2px solid ${item.color}44`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.5rem',
                        transition: 'transform 220ms cubic-bezier(.2,.8,.2,1), border-color 220ms ease',
                        position: 'relative',
                      }}
                    >
                      {item.icon}
                    </div>
                    <div
                      style={{
                        width: 38, height: 38, borderRadius: '50%',
                        border: `3px solid ${item.color}55`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 800,
                        color: item.color,
                        fontSize: '0.85rem',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {item.step}
                    </div>
                  </div>
                  <h3 className="heading-md" style={{ marginBottom: '0.75rem' }}>{item.title}</h3>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', lineHeight: 1.7 }}>
                    {item.desc.split('\n').map((bullet, bi) => (
                      <div key={bi} style={{ display: 'flex', gap: '0.5rem', marginBottom: bi < 2 ? '0.35rem' : 0 }}>
                        <span style={{ color: item.color, flexShrink: 0 }}>•</span>
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

      {/* ── Comparison ───────────────────────────────── */}
      <section style={{ padding: '5rem 0', background: 'var(--bg-surface)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <p className="label" style={{ color: 'var(--accent-red)', marginBottom: '0.75rem' }}>⚖️ The Showdown</p>
            <h2 className="display-md" style={{ textWrap: 'balance', scrollMarginTop: '5rem' }}>Old Legacy vs Pactopus Tentacle</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem', fontSize: '1rem' }}>
              Crunched on a £5,000 monthly invoice. The numbers don&apos;t lie — and neither do octopuses.
            </p>
          </div>

          <div className="compare-grid" style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            <div
              className="compare-card old"
              style={{
                borderTop: '3px solid var(--accent-red)',
                borderRadius: 24,
                padding: '2rem 1.75rem',
                backgroundColor: 'var(--bg-card)',
                backgroundImage: 'linear-gradient(180deg, rgba(var(--brand-secondary-rgb),0.08) 0%, rgba(255,255,255,0.015) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 30px rgba(0,0,0,0.35)',
                border: '1px solid rgba(255,255,255,0.06)',
                position: 'relative',
                overflow: 'hidden',
                transition: 'transform 220ms cubic-bezier(.2,.8,.2,1)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
            >
              <div style={{
                position: 'absolute',
                top: 12,
                right: 12,
                fontSize: '0.65rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.28)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '0.25rem 0.6rem',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.03)',
              }}>
                legacy
              </div>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🏛️</div>
              <h3 className="heading-md" style={{ marginBottom: '1.5rem', color: 'var(--accent-red)' }}>Bank Wire / Stripe</h3>
              {[
                ['Settlement speed', '3–5 business days (zzzz… 💤)'],
                ['Fees on £5k', '2.9% + £0.30 = roughly £145'],
                ['Currency risk', 'FX conversion nibbles your profit'],
                ['Reversals', 'Chargebacks possible (gulp)'],
                ['Operating hours', 'Business hours only (boooring)'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: '1rem', minWidth: 0 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', flexShrink: 0 }}>{k}</span>
                  <span style={{ color: 'var(--accent-red)', fontSize: '0.85rem', whiteSpace: 'normal', textAlign: 'right', wordBreak: 'break-word', minWidth: 0, flex: '1 1 auto' }}>{v}</span>
                </div>
              ))}
            </div>

            <div
              className="compare-card new"
              style={{
                borderTop: '3px solid var(--accent-gold)',
                borderRadius: 24,
                padding: '2rem 1.75rem',
                backgroundColor: 'var(--bg-card)',
                backgroundImage: 'linear-gradient(180deg, rgba(var(--brand-rgb),0.10) 0%, rgba(255,255,255,0.02) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 50px rgba(var(--brand-rgb),0.14)',
                border: '1px solid rgba(var(--brand-rgb),0.22)',
                position: 'relative',
                overflow: 'hidden',
                transition: 'transform 220ms cubic-bezier(.2,.8,.2,1)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
            >
              <svg
                width="92"
                height="92"
                viewBox="0 0 92 92"
                style={{ position: 'absolute', top: 0, right: 0, pointerEvents: 'none', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }}
              >
                <defs>
                  <linearGradient id="ribbon-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#f97316" />
                  </linearGradient>
                </defs>
                <path d="M2 2 L90 2 L90 90 L60 60 L30 90 Z" fill="url(#ribbon-grad)" opacity="0.92" />
                <text
                  x="60"
                  y="34"
                  fill="#1a0a00"
                  fontSize="10"
                  fontWeight="900"
                  textAnchor="middle"
                  fontFamily="var(--font-display), system-ui"
                  letterSpacing="0.08em"
                  transform="rotate(45, 60, 34)"
                >
                  WINNER
                </text>
              </svg>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🐙⚡</div>
              <h3 className="heading-md" style={{ marginBottom: '1.5rem', color: 'var(--accent-gold)' }}>Pactopus on {isAlgo ? 'Algorand' : 'Arc'}</h3>
              {[
                ['Settlement speed', isAlgo ? '1.5 seconds (blink twice, miss it)' : '<1 second (faster than ink!)'],
                ['Fees on £5k', '0.5% = £25 — save a clean £120'],
                ['Currency risk', 'Stablecoins = stable, calm waters 🌊'],
                ['Reversals', 'Eight arms, zero chargebacks.'],
                ['Operating hours', '24/7/365 — octopuses don\'t sleep on you'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid var(--border-subtle)', gap: '1rem', minWidth: 0 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', flexShrink: 0 }}>{k}</span>
                  <span style={{ color: 'var(--accent-gold)', fontSize: '0.85rem', whiteSpace: 'normal', textAlign: 'right', wordBreak: 'break-word', minWidth: 0, flex: '1 1 auto' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────── */}
      <section style={{ padding: '6rem 0' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <p className="label" style={{ color: 'var(--accent-gold)', marginBottom: '0.75rem' }}>✨ Why it works</p>
            <h2 className="display-md" style={{ textWrap: 'balance', scrollMarginTop: '5rem' }}>Built with Tentacle-Level Precision</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem', fontSize: '1rem' }}>
              Every feature engineered with one goal: getting you paid faster, cheaper, and with way more personality.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {[
              {
                icon: '🌊',
                title: isAlgo ? 'Swims on Algorand' : 'Dives into Arc',
                desc: [
                  isAlgo ? 'Runs on Algorand L1 for sub-2s finality and atomic ASA groups.' : 'Runs on Arc for instant settlement and a native wallet experience.',
                  'Your tokens stay on the chain you trust — no wrapping, no detours.',
                  'Direct wallet-to-wallet settlement. No middlemen siphoning ink.',
                ].join('||'),
              },
              {
                icon: '🦑',
                title: 'Octopus-Adaptive Branding',
                desc: [
                  `Pactopus shifts its primary palette in milliseconds to match ${isAlgo ? 'Algorand teal' : 'Arc coral'}.`,
                  'Each tailored workspace feels native to the chain it serves — like a master of mimicry.',
                  'No awkward "does this look right?" moments. Just camouflage, perfected.',
                ].join('||'),
              },
              {
                icon: '🛡️',
                title: 'Verified, Server-Side Settlements',
                desc: [
                  'Every payment is checked server-side before an invoice flips to "paid".',
                  'No fake confirmations, no client-side trickery, no ghost transactions.',
                  'Status updates you can actually trust. Your business, double-checked.',
                ].join('||'),
              },
              {
                icon: '🤝',
                title: 'Client + Freelancer Aligned',
                desc: [
                  'Creates the perfect trust balance: clients see exactly what they pay for, you see exactly when it lands.',
                  'No haggling, no chasing, no awkward "did you get it yet?" emails.',
                  'Blockchain certainty + human-friendly UI = happy tentacles all around.',
                ].join('||'),
              },
              {
                icon: '❤️',
                title: 'Octopus Fact',
                desc: [
                  'Did you know? Octopuses have three hearts.',
                  'Pactopus has three priorities: 1) you get paid, 2) fees stay tiny, 3) your client can actually figure out how to click Pay.',
                  'Also: octopuses have blue blood. We just have blue (and teal, and coral) UI accents. 💙',
                ].join('||'),
                special: true,
              },
            ].map((f) => (
              <div
                key={f.title}
                className="card"
                style={{
                  padding: '2rem 1.75rem',
                  borderRadius: 24,
                  backgroundColor: f.special
                    ? 'transparent'
                    : 'var(--bg-card)',
                  backgroundImage: f.special
                    ? 'linear-gradient(160deg, rgba(var(--brand-rgb),0.10) 0%, rgba(var(--brand-secondary-rgb),0.06) 50%, rgba(255,255,255,0.02) 100%)'
                    : 'linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.01) 100%)',
                  border: f.special
                    ? '1px solid rgba(var(--brand-rgb),0.25)'
                    : '1px solid rgba(255,255,255,0.07)',
                  boxShadow: f.special
                    ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 40px rgba(var(--brand-rgb),0.10)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 30px rgba(0,0,0,0.3)',
                  transition: 'transform 220ms cubic-bezier(.2,.8,.2,1), box-shadow 220ms ease, border-color 220ms ease',
                  position: 'relative',
                  overflow: 'hidden',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.transform = 'translateY(-5px)';
                  el.style.boxShadow = f.special
                    ? 'inset 0 1px 0 rgba(255,255,255,0.1), 0 18px 50px rgba(var(--brand-rgb),0.16)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.07), 0 16px 45px rgba(0,0,0,0.4)';
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.transform = 'translateY(0)';
                  el.style.boxShadow = f.special
                    ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 40px rgba(var(--brand-rgb),0.10)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 30px rgba(0,0,0,0.3)';
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '1rem', color: 'var(--accent-gold)' }}>
                  {f.icon}
                </div>
                <h3 className="heading-md" style={{ marginBottom: '1rem', fontFamily: 'var(--font-display)', color: 'var(--accent-gold)', fontSize: '1.15rem' }}>{f.title}</h3>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.90rem', lineHeight: 1.7 }}>
                  {f.desc.split('||').map((bullet, bi) => (
                    <div key={bi} style={{ display: 'flex', gap: '0.5rem', marginBottom: bi < 2 ? '0.45rem' : 0 }}>
                      <span style={{ color: 'var(--accent-gold)', flexShrink: 0, marginTop: 1 }}>•</span>
                      <span>{bullet}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────── */}
      <section style={{ padding: '5rem 0', background: 'var(--bg-surface)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <p className="label" style={{ color: 'var(--accent-gold)', marginBottom: '0.75rem' }}>🪸 Transparent Pricing</p>
            <h2 className="display-md" style={{ textWrap: 'balance', scrollMarginTop: '5rem' }}>Pick Your Tentacle Tier</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem', fontSize: '1rem' }}>
              Swim solo, build a reef, or command an armada — every tier settles in USDC on Arc or via Circle Checkout.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', maxWidth: 1000, margin: '0 auto' }}>
            {[
              {
                plan: 'free' as const,
                tierLabel: 'The Solo Tide',
                price: '0 USDC',
                period: 'forever (£0)',
                tagline: 'Dip a single tentacle. Free, forever.',
                features: [
                  '5 invoices/month — perfect for side hustles',
                  'USDC & EURC stablecoin payouts',
                  'Shareable payment links & expiration dates',
                  '0.5% transaction fee — only when you get paid',
                  'Chain-adaptive UI (Arc & Algorand camouflage)',
                ],
                cta: 'Start for free',
                ctaAria: 'Select the Solo Tide free plan',
                highlight: false,
              },
              {
                plan: 'pro' as const,
                tierLabel: 'The Reef Pro',
                price: '15 USDC',
                period: '/month (~£12)',
                tagline: 'Serious invoicing for serious tentacles.',
                features: [
                  '10,000 invoices/month — scale without limits',
                  '0.4% transaction fee — reduced platform fee',
                  'CSV invoice export — ready for accounting 📊',
                  'Smart Invoice Parser & Comms Assistant',
                  'On-chain USDC or Circle Checkout upgrade',
                ],
                cta: 'Choose The Reef Pro',
                ctaAria: 'Choose The Reef Pro plan at 15 USDC per month',
                highlight: true,
              },
              {
                plan: 'business' as const,
                tierLabel: 'The Armada Business',
                price: '50 USDC',
                period: '/month (~£40)',
                tagline: 'When one octopus isn\'t enough. Deploy the fleet.',
                features: [
                  '1,000,000 invoices/month — enterprise capacity',
                  '0.3% transaction fee — maximum volume savings',
                  'HTTP 402 programmatic agent billing APIs',
                  'DeFi ERC-4626 treasury sweep automation',
                  'Everything in The Reef Pro included',
                ],
                cta: 'Choose Armada Business',
                ctaAria: 'Choose the Armada Business plan at 50 USDC per month',
                highlight: false,
              },
            ].map(tier => (
              <div
                key={tier.plan}
                className="card"
                style={{
                  padding: '2rem',
                  borderRadius: 26,
                  position: 'relative',
                  backgroundColor: tier.highlight
                    ? 'transparent'
                    : 'var(--bg-card)',
                  backgroundImage: tier.highlight
                    ? 'linear-gradient(180deg, rgba(var(--brand-rgb),0.12) 0%, rgba(var(--brand-secondary-rgb),0.06) 50%, rgba(255,255,255,0.02) 100%)'
                    : 'linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.01) 100%)',
                  border: tier.highlight
                    ? '1px solid rgba(var(--brand-rgb),0.32)'
                    : '1px solid rgba(255,255,255,0.07)',
                  boxShadow: tier.highlight
                    ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 14px 55px rgba(var(--brand-rgb),0.16)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 30px rgba(0,0,0,0.3)',
                  transition: 'transform 220ms cubic-bezier(.2,.8,.2,1), box-shadow 220ms ease',
                  overflow: 'visible',
                  zIndex: tier.highlight ? 2 : 1,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-6px)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
              >
                {tier.highlight && (
                  <>
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '140%',
                      height: '140%',
                      background: 'radial-gradient(circle, rgba(var(--brand-rgb),0.18) 0%, rgba(var(--brand-secondary-rgb),0.08) 35%, transparent 70%)',
                      filter: 'blur(20px)',
                      pointerEvents: 'none',
                      zIndex: -1,
                      animation: 'pulse 3.2s ease-in-out infinite',
                    }} />
                    <div style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
                      <span className="badge badge-cyan" style={{
                        padding: '0.45rem 1rem',
                        borderRadius: 999,
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        fontSize: '0.72rem',
                        boxShadow: '0 6px 20px rgba(var(--brand-rgb),0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
                        background: 'linear-gradient(135deg, var(--accent-gold), var(--accent-red))',
                        color: '#1a0a00',
                        border: 'none',
                      }}>
                        ✨ POPULAR
                      </span>
                    </div>
                  </>
                )}
                <div style={{ marginBottom: '1rem', paddingTop: tier.highlight ? '0.75rem' : 0 }}>
                  <p className="label" style={{ color: tier.highlight ? 'var(--accent-gold)' : 'var(--text-muted)', marginBottom: '0.35rem', fontSize: '0.72rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}>{tier.plan} tier</p>
                  <h3 className="heading-md" style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.35rem' }}>{tier.tierLabel}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.35rem', lineHeight: 1.45, marginBottom: 0 }}>{tier.tagline}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '2.25rem', fontWeight: 800, color: tier.highlight ? 'var(--accent-gold)' : 'var(--text-primary)' }}>{tier.price}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{tier.period}</span>
                </div>
                <ul style={{ listStyle: 'none', marginBottom: '2rem', padding: 0 }}>
                  {tier.features.map(f => (
                    <li key={f} style={{ padding: '0.55rem 0', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.87rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.55rem', lineHeight: 1.45 }}>
                      <span style={{ color: 'var(--accent-green)', flexShrink: 0, marginTop: 1 }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handlePlanClick(tier.plan, tier.price)}
                  className={`btn ${tier.highlight ? 'btn-primary' : 'btn-secondary'} btn-full`}
                  id={`pricing-${tier.plan}-btn`}
                  ref={tier.highlight ? subModalTriggerRef : undefined}
                  aria-label={('ctaAria' in tier && typeof tier.ctaAria === 'string') ? tier.ctaAria : tier.cta}
                >
                  {tier.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────── */}
      <section style={{ padding: '6rem 0', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 700,
          height: 700,
          maxWidth: '140%',
          background: 'radial-gradient(circle, rgba(var(--brand-rgb),0.12) 0%, rgba(var(--brand-secondary-rgb),0.06) 35%, transparent 70%)',
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }} />
        <div className="container-sm" style={{ position: 'relative', zIndex: 1 }}>
          <p className="label" style={{ color: 'var(--accent-gold)', marginBottom: '0.75rem', fontSize: '0.85rem', letterSpacing: '0.1em' }}>🐙 One last cephalo-pun before you go:</p>
          <h2 className="display-md" style={{ marginBottom: '1rem', textWrap: 'balance', scrollMarginTop: '5rem' }}>
            Why don&apos;t octopuses like late payments?<br />
            <span className="gradient-text-gold">They prefer settled cephalo-pods.</span> 🦑
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', fontSize: '1.0625rem', lineHeight: 1.7, maxWidth: 580, marginInline: 'auto' }}>
            Okay, we&apos;ll ink-vest in better jokes. But seriously — join the freelancers, agencies, and studios using Pactopus to get paid. First invoice is free, takes under a minute, and all 3 hearts are into it.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/create" className="btn btn-primary btn-lg btn-pulse" id="bottom-cta-btn" style={{ flex: '1 1 240px', minWidth: 0, maxWidth: 360 }}>
              🐙 Create Your First Invoice →
            </Link>
            <Link href="/onboarding" className="btn btn-ghost btn-lg" style={{ flex: '1 1 240px', minWidth: 0, maxWidth: 360 }}>
              📚 See how it works
            </Link>
          </div>
        </div>
      </section>

      </main>

      {showOverlay && <WorkspaceOverlay onSelect={handleWorkspaceChoice} />}

      {/* ── Footer ───────────────────────────────────── */}
      <footer className="footer">
        <div className="container">
          <div className="footer-inner">
            <div>
              <div className="navbar-logo" style={{ marginBottom: '0.5rem' }}>
                <PactopusLogo height={34} />
              </div>
              <p className="footer-copy">
                © 2026 <a href="https://kyrvynltd.co.uk" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-gold)', textDecoration: 'underline' }}>Kyrvyn Ltd</a>. All rights reserved.<br />
                Developed and owned by Kyrvyn Ltd (kyrvynltd.co.uk). Powered by {isAlgo ? 'Algorand' : 'Arc'}, recolored in milliseconds by Pactopus. Three hearts. Eight arms. Zero chargebacks.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <Link href="/onboarding" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Help</Link>
              <Link href="/create" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>New invoice</Link>
              <Link href="/dashboard" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>My dashboard</Link>
            </div>
          </div>
        </div>
      </footer>

      {showSubModal && selectedPlan && (
        <SubscriptionModal
          plan={selectedPlan.plan}
          price={selectedPlan.price}
          onClose={() => setShowSubModal(false)}
          onSuccess={handleSubSuccess}
          triggerRef={subModalTriggerRef as unknown as React.RefObject<HTMLElement>}
        />
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050506', color: '#fff' }}>
        <div className="loader" />
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
