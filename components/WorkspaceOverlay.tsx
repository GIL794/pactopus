'use client';

import React, { useEffect, useRef } from 'react';
import PactopusLogo from '@/components/PactopusLogo';

interface WorkspaceOverlayProps {
  onSelect: (network: 'arc' | 'algorand') => void;
  triggerRef?: React.RefObject<HTMLElement>;
}

export default function WorkspaceOverlay({ onSelect, triggerRef }: WorkspaceOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!overlayRef.current) return;
    const focusable = overlayRef.current?.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
    );
    const first = focusable?.[0];
    first?.focus();
    const trigger = triggerRef?.current;
    return () => {
      trigger?.focus();
    };
  }, [triggerRef]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    if (!overlayRef.current) return;
    const focusable = overlayRef.current.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-title"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(10, 10, 18, 0.55)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        overscrollBehavior: 'contain'
      }}
    >
      <div style={{
        backgroundColor: 'var(--bg-card)',
        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0) 100%)',
        border: '1px solid var(--border)',
        borderRadius: 28,
        padding: '3rem 2.5rem',
        maxWidth: '850px',
        width: '100%',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', top: -150, left: '20%', width: 320, height: 320, background: 'radial-gradient(circle, rgba(var(--brand-secondary-rgb),0.22), transparent)', filter: 'blur(60px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -160, right: '20%', width: 360, height: 360, background: 'radial-gradient(circle, rgba(var(--brand-rgb),0.18), transparent)', filter: 'blur(70px)', pointerEvents: 'none' }} />

        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ margin: '0 auto 1.5rem', display: 'flex', justifyContent: 'center' }}>
            <PactopusLogo height={52} />
          </div>
          <h2 id="workspace-title" className="heading-xl" style={{ fontFamily: 'var(--font-display)', marginBottom: '0.5rem' }}>Multiple Wallets Detected</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto', fontSize: '0.9375rem', lineHeight: 1.6 }}>
            Both EVM (MetaMask/Coinbase) and Algorand extensions were found. Choose the workspace Pactopus should activate, and the interface will recolor in milliseconds to match that chain.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginTop: '2.5rem' }}>
          <div
            className="card select-card"
            role="button"
            tabIndex={0}
            style={{
              padding: '2.25rem 1.75rem',
              cursor: 'pointer',
              border: '1px solid rgba(255,182,72,0.28)',
              borderRadius: 24,
              backgroundColor: 'var(--bg-card)',
              backgroundImage: 'linear-gradient(180deg, rgba(255,182,72,0.06) 0%, rgba(255,255,255,0.02) 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 30px rgba(0,0,0,0.35)',
              transition: 'transform 220ms cubic-bezier(.2,.8,.2,1), border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease, background-image 220ms ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%'
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
            onClick={() => onSelect('arc')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect('arc');
              }
            }}
          >
            <div>
              <div style={{ fontSize: '2.5rem', marginBottom: '1.25rem' }}>🏛️</div>
              <h3 className="heading-md" style={{ marginBottom: '0.75rem', color: 'var(--accent-gold)' }}>Arc L1 Network</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', lineHeight: 1.6, marginBottom: '2rem' }}>
                Pick Arc for an Arc-tailored workspace, quick settlement, and a warm coral-and-mango palette that feels right at home.
              </p>
            </div>
            <button className="btn btn-secondary btn-full" style={{ borderColor: 'rgba(255,182,72,0.45)' }}>
              Enter Arc Workspace
            </button>
          </div>

          <div
            className="card select-card"
            role="button"
            tabIndex={0}
            style={{
              padding: '2.25rem 1.75rem',
              cursor: 'pointer',
              border: '1px solid rgba(0,183,176,0.28)',
              borderRadius: 24,
              backgroundColor: 'var(--bg-card)',
              backgroundImage: 'linear-gradient(180deg, rgba(0,183,176,0.06) 0%, rgba(255,255,255,0.02) 100%)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 30px rgba(0,0,0,0.35)',
              transition: 'transform 220ms cubic-bezier(.2,.8,.2,1), border-color 220ms ease, box-shadow 220ms ease, background-color 220ms ease, background-image 220ms ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%'
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
            onClick={() => onSelect('algorand')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect('algorand');
              }
            }}
          >
            <div>
              <div style={{ fontSize: '2.5rem', marginBottom: '1.25rem' }}>⚡</div>
              <h3 className="heading-md" style={{ marginBottom: '0.75rem', color: 'var(--accent-cyan)' }}>Algorand Vault</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', lineHeight: 1.6, marginBottom: '2rem' }}>
                Pick Algorand for a bright ocean-teal workspace, super smooth confirmations, and wallet support via Pera or injected providers.
              </p>
            </div>
            <button className="btn btn-secondary btn-full" style={{ borderColor: 'rgba(0,183,176,0.45)' }}>
              Enter Algorand Workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
