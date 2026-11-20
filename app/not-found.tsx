'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';
import PactopusLogo from '@/components/PactopusLogo';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8rem 2rem 4rem', textAlign: 'center' }}>
        <div className="card" style={{ maxWidth: 520, width: '100%', padding: '3rem 2rem', borderTop: '3px solid var(--accent-gold)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <PactopusLogo height={50} />
          </div>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🐙</div>
          <h1 className="heading-xl" style={{ fontFamily: 'var(--font-display)', marginBottom: '0.75rem' }}>
            404 — Agreement Not Found
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '2rem' }}>
            The invoice or page you are looking for does not exist on the ledger or has moved.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/" className="btn btn-primary">
              Back to Homepage
            </Link>
            <Link href="/create" className="btn btn-secondary">
              Create Invoice
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
