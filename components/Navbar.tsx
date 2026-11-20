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
  const { isConnected, address, network, setNetwork } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const [funMode, setFunMode] = useState(() => (typeof window !== 'undefined' ? isFunModeEnabled() : false));

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="navbar">
      <div className="container">
        <div className="navbar-inner">
          {/* Logo & Network Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link href="/" className="navbar-logo" style={{ color: 'var(--text-primary)' }}>
              <PactopusLogo height={36} />
            </Link>
            <button
              type="button"
              onClick={() => setNetwork(network === 'algorand' ? 'arc' : 'algorand')}
              className="network-switch-btn"
              id="navbar-network-switch-btn"
              title={`Active: ${network === 'algorand' ? 'Algorand Vault' : 'Arc L1'}. Click to switch to ${network === 'algorand' ? 'Arc L1' : 'Algorand'}.`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.3rem 0.75rem',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                background: network === 'algorand' ? 'rgba(0, 183, 176, 0.14)' : 'rgba(255, 182, 72, 0.16)',
                border: `1px solid ${network === 'algorand' ? 'rgba(0, 183, 176, 0.35)' : 'rgba(255, 182, 72, 0.4)'}`,
                color: network === 'algorand' ? 'var(--accent-cyan)' : 'var(--accent-gold)',
                boxShadow: network === 'algorand' ? '0 0 12px rgba(0, 183, 176, 0.2)' : '0 0 12px rgba(255, 182, 72, 0.2)',
                transition: 'all 180ms ease',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <span style={{ fontSize: '0.8rem' }}>{network === 'algorand' ? '⚡' : '🏛️'}</span>
              <span>{network === 'algorand' ? 'Algorand' : 'Arc L1'}</span>
              <span style={{ fontSize: '0.65rem', opacity: 0.8, marginLeft: '0.1rem' }}>⇄ Switch</span>
            </button>
          </div>

          {/* Nav Links */}
          <ul className="navbar-links">
            <li>
              <Link
                href="/"
                style={{ color: isActive('/') ? 'var(--accent-gold)' : undefined }}
              >
                Home
              </Link>
            </li>
            <li>
              <Link
                href="/create"
                style={{ color: isActive('/create') ? 'var(--accent-gold)' : undefined }}
              >
                New Invoice
              </Link>
            </li>
            {isConnected && (
              <li>
                <Link
                  href="/dashboard"
                  style={{ color: isActive('/dashboard') ? 'var(--accent-gold)' : undefined }}
                >
                  My Dashboard
                </Link>
              </li>
            )}
            <li>
              <Link
                href="/onboarding"
                style={{ color: isActive('/onboarding') ? 'var(--accent-gold)' : undefined }}
              >
                Help
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
                          <div style={{ fontWeight: 800, marginBottom: '0.15rem' }}>OctoFun is on!</div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.4 }}>
                            You’ll get little rewards at milestones.
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
              <span style={{
                fontSize: '0.8125rem',
                color: 'var(--text-muted)',
                fontFamily: 'monospace',
                marginRight: '0.25rem',
              }}>
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            )}
            <WalletButton />
          </div>
        </div>
      </div>
    </nav>
  );
}
