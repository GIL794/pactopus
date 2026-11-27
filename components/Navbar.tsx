'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useWallet } from '@/lib/wallet';
import { useTheme } from '@/lib/theme';
import { isFunModeEnabled, setFunModeEnabled } from '@/lib/milestones';
import toast from 'react-hot-toast';
import PactopusLogo from './PactopusLogo';
import WalletButton from './WalletButton';

export default function Navbar() {
  const pathname = usePathname();
  const { isConnected, address, network, toggleSeekerMode } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const [funMode, setFunMode] = useState(() => (typeof window !== 'undefined' ? isFunModeEnabled() : false));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => pathname === path;
  const isSeeker = network === 'seeker';

  return (
    <nav className="navbar">
      <div className="container">
        <div className="navbar-inner">
          {/* Logo & Octopus Chameleon Solana Seeker Hardware Pairing Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href="/" className="navbar-logo" style={{ color: 'var(--text-primary)' }} onClick={() => setMobileMenuOpen(false)}>
              <PactopusLogo height={36} />
            </Link>
            <button
              type="button"
              onClick={toggleSeekerMode}
              className="network-switch-btn"
              id="navbar-network-switch-btn"
              title={
                isSeeker
                  ? 'Active: Solana Seeker Hardware Mode (0.25% · Max £5 cap). Click to preview Standard Web Mode (0.50% · Max £50 cap).'
                  : 'Active: Solana Standard Web Mode (0.50% · Max £50 cap). Click to pair Solana Seeker Hardware Mode (0.25% · Max £5 cap).'
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.32rem 0.8rem',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: isSeeker
                  ? 'linear-gradient(135deg, rgba(20, 241, 149, 0.18), rgba(0, 209, 255, 0.14))'
                  : 'linear-gradient(135deg, rgba(153, 69, 255, 0.18), rgba(20, 241, 149, 0.12))',
                border: `1px solid ${isSeeker ? 'rgba(20, 241, 149, 0.45)' : 'rgba(153, 69, 255, 0.45)'}`,
                color: 'var(--text-primary)',
                boxShadow: isSeeker
                  ? '0 0 16px rgba(20, 241, 149, 0.22)'
                  : '0 0 16px rgba(153, 69, 255, 0.22)',
                transition: 'all 180ms ease',
                letterSpacing: '0.03em',
              }}
            >
              <span style={{ fontSize: '0.85rem' }}>{isSeeker ? '📱' : '◎'}</span>
              <span>
                {isSeeker ? 'Seeker 0.25% (Max £5)' : 'Solana Web 0.5% (Max £50)'}
              </span>
              <span style={{ fontSize: '0.65rem', opacity: 0.85, marginLeft: '0.1rem' }}>
                ⇄ {isSeeker ? 'Web' : 'Seeker'}
              </span>
            </button>
          </div>

          {/* Desktop Nav Links */}
          <ul className="navbar-links">
            <li>
              <Link
                href="/"
                style={{ color: isActive('/') ? 'var(--accent-cyan)' : undefined }}
              >
                Home
              </Link>
            </li>
            <li>
              <Link
                href="/create"
                style={{ color: isActive('/create') ? 'var(--accent-cyan)' : undefined }}
              >
                New Invoice
              </Link>
            </li>
            {isConnected && (
              <li>
                <Link
                  href="/dashboard"
                  style={{ color: isActive('/dashboard') ? 'var(--accent-cyan)' : undefined }}
                >
                  My Dashboard
                </Link>
              </li>
            )}
            <li>
              <Link
                href="/onboarding"
                style={{ color: isActive('/onboarding') ? 'var(--accent-cyan)' : undefined }}
              >
                Seeker &amp; Help
              </Link>
            </li>
          </ul>

          {/* Actions */}
          <div className="navbar-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button
              type="button"
              className={`octofun-toggle ${funMode ? 'is-on' : 'is-off'}`}
              aria-pressed={funMode}
              onClick={() => {
                const next = !funMode;
                setFunMode(next);
                setFunModeEnabled(next);
                if (next) {
                  toast.custom(t => (
                    <div
                      className="toast toast-milestone"
                      style={{
                        opacity: t.visible ? 1 : 0,
                        transform: t.visible ? 'translateY(0)' : 'translateY(8px)',
                        transition: 'opacity 180ms ease, transform 180ms ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                        <div style={{ fontSize: '1.25rem', lineHeight: 1 }}>🐙</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, marginBottom: '0.15rem' }}>Fun mode on</div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.4 }}>
                            Celebration messages are on. They are not linked to fees or rewards.
                          </div>
                        </div>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Dismiss notification"
                          onClick={() => toast.dismiss(t.id)}
                          style={{ marginTop: -2 }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ));
                }
              }}
              aria-label={funMode ? 'toggle the octofun! (on)' : 'toggle the octofun! (off)'}
              title="toggle the octofun!"
            >
              <span aria-hidden="true" className="octofun-emoji">🐙</span>
              <span className="octofun-label">toggle the octofun!</span>
            </button>
            {isConnected && address && (
              <span
                className="mono-num"
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--text-muted)',
                  marginRight: '0.25rem',
                }}
              >
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            )}
            <WalletButton />
            <button
              type="button"
              className="navbar-hamburger"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              id="navbar-hamburger-btn"
            >
              <span />
            </button>
          </div>
        </div>

        {/* Mobile & Solana Seeker Navigation Drawer (<1024px) */}
        {mobileMenuOpen && (
          <div className="navbar-mobile-drawer" role="navigation" aria-label="Mobile navigation">
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              style={{ color: isActive('/') ? 'var(--accent-cyan)' : undefined }}
            >
              🏠 Home
            </Link>
            <Link
              href="/create"
              onClick={() => setMobileMenuOpen(false)}
              style={{ color: isActive('/create') ? 'var(--accent-cyan)' : undefined }}
            >
              ⚡ New Invoice
            </Link>
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              style={{ color: isActive('/dashboard') ? 'var(--accent-cyan)' : undefined }}
            >
              📊 My GBP Dashboard
            </Link>
            <Link
              href="/onboarding"
              onClick={() => setMobileMenuOpen(false)}
              style={{ color: isActive('/onboarding') ? 'var(--accent-cyan)' : undefined }}
            >
              📱 Seeker &amp; Help
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
