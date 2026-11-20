'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
  STRIPE_FIXED_PER_INVOICE_GBP,
  STRIPE_FEE_BPS_DECIMAL,
  computeCappedInvoiceFeeGbp,
} from '@/lib/billing';
import { useOptionalWallet } from '@/lib/wallet';

interface SavingsCSSProperties extends React.CSSProperties {
  '--thumb-pct': string;
  '--track-pct': string;
}

function formatGBP(n: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(n);
}

export default function SavingsHeroSlider() {
  const wallet = useOptionalWallet();
  const isSeeker = wallet?.network === 'seeker' || Boolean(wallet?.seekerVerified);
  const [monthly, setMonthly] = useState(5000);
  const MIN = 100;
  const MAX = 50000;
  const STEP = 100;
  const AVG_INVOICE = 1000;

  const {
    invoicesPerMonth,
    stripeMonthly,
    webMonthlyFee,
    seekerMonthlyFee,
    activeMonthlyFee,
    savedMonth,
    savedYear,
    saved3y,
    saved5y,
    saved10y,
  } = useMemo(() => {
    const inv = Math.max(1, Math.round(monthly / AVG_INVOICE));
    const perInvAmount = monthly / inv;
    const stripeM =
      inv * STRIPE_FIXED_PER_INVOICE_GBP + monthly * STRIPE_FEE_BPS_DECIMAL;
    const webFeePerInv = computeCappedInvoiceFeeGbp(perInvAmount, false).feeGbp;
    const seekerFeePerInv = computeCappedInvoiceFeeGbp(perInvAmount, true).feeGbp;
    const webM = inv * webFeePerInv;
    const seekerM = inv * seekerFeePerInv;
    const activeM = isSeeker ? seekerM : webM;
    const sMonth = Math.max(0, stripeM - activeM);
    return {
      invoicesPerMonth: inv,
      stripeMonthly: stripeM,
      webMonthlyFee: webM,
      seekerMonthlyFee: seekerM,
      activeMonthlyFee: activeM,
      savedMonth: sMonth,
      savedYear: sMonth * 12,
      saved3y: sMonth * 36,
      saved5y: sMonth * 60,
      saved10y: sMonth * 120,
    };
  }, [monthly, AVG_INVOICE, isSeeker]);

  const pct = useMemo(() => ((monthly - MIN) / (MAX - MIN)) * 100, [monthly, MIN, MAX]);
  const thumbPct = `${pct}%`;
  const trackPct = `${pct}%`;
  const bubbleStyle: SavingsCSSProperties = { '--thumb-pct': thumbPct, '--track-pct': trackPct };
  const trackStyle: SavingsCSSProperties = { '--thumb-pct': thumbPct, '--track-pct': trackPct };

  const onAmountInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      if (!Number.isFinite(v)) return;
      setMonthly(Math.max(MIN, Math.min(MAX, Math.round(v / STEP) * STEP)));
    },
    [MIN, MAX, STEP]
  );

  const onRangeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setMonthly(Number(e.target.value));
    },
    []
  );

  return (
    <div
      className="savings-card noise-overlay"
      aria-label="Monthly invoicing savings calculator"
      role="group"
      aria-labelledby="savings-heading savings-purpose"
    >
      <header className="savings-head">
        <div className="savings-head-copy">
          <p className="savings-kicker">
            🐙 {isSeeker ? 'Solana Seeker 0.25% (Max £5 Cap) Active' : 'Solana Web 0.50% (Max £50 Cap) Active'}
          </p>
          <h3 className="savings-title" id="savings-heading">
            Drag the slider. See how much you keep vs Stripe.
          </h3>
          <p className="savings-purpose" id="savings-purpose">
            Compare Stripe&apos;s 2.9% + 30p against Pactopus{' '}
            <strong>Standard Web (0.5% capped at £50)</strong> and{' '}
            <strong>Solana Seeker Phone (0.25% capped at £5)</strong> — £0/month forever.
          </p>
          <div className="savings-drag-hint" aria-hidden>
            <span className="savings-drag-hint-icon">👆</span>
            <span>
              <strong>Drag left</strong> for solo freelancers ·{' '}
              <strong>Drag right</strong> for agencies &amp; Seeker holders
            </span>
          </div>
        </div>
        <div className="savings-head-amount">
          <div className="savings-amount-group">
            <span className="savings-amount-symbol" aria-hidden>£</span>
            <input
              className="savings-amount-input"
              type="number"
              min={MIN}
              max={MAX}
              step={STEP}
              value={monthly}
              onChange={onAmountInputChange}
              aria-label="Monthly invoiced amount in pounds. Drag the range slider below or type a value here."
            />
          </div>
          <p className="savings-amount-caption">
            Your monthly volume · <strong>{MIN.toLocaleString()}</strong> to <strong>{MAX.toLocaleString()}</strong>
          </p>
        </div>
      </header>

      <div className="savings-slider-wrap">
        <div
          className="savings-slider-bubble"
          aria-hidden
          style={bubbleStyle}
        >
          <span>{formatGBP(monthly)}</span>
          <small>{invoicesPerMonth} invoice{invoicesPerMonth === 1 ? '' : 's'}</small>
          <i />
        </div>

        <input
          className="savings-slider"
          id="savings-range"
          type="range"
          min={MIN}
          max={MAX}
          step={STEP}
          value={monthly}
          aria-labelledby="savings-heading"
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={monthly}
          aria-valuetext={`${formatGBP(monthly)} per month, saving ${formatGBP(savedMonth)} versus Stripe`}
          onChange={onRangeChange}
          style={trackStyle}
        />

        <div className="savings-axis">
          <div className="savings-axis-marker start">
            <span className="savings-axis-pin" aria-hidden />
            <span className="savings-axis-label">
              <em>Start</em> £{MIN.toLocaleString()}
            </span>
            <span className="savings-axis-sub">solo freelancer</span>
          </div>
          <div className="savings-axis-marker mid">
            <span className="savings-axis-pin" aria-hidden />
            <span className="savings-axis-label">
              <em>Mid</em> £{((MIN + MAX) / 2).toLocaleString()}
            </span>
            <span className="savings-axis-sub">cap kicks in (£5 / £50)</span>
          </div>
          <div className="savings-axis-marker end">
            <span className="savings-axis-pin" aria-hidden />
            <span className="savings-axis-label">
              <em>End</em> £{MAX.toLocaleString()}
            </span>
            <span className="savings-axis-sub">agency · max cap</span>
          </div>
        </div>
      </div>

      {/* Live Jupiter-style 3-way fee pill */}
      <div
        className="jupiter-route-pill"
        style={{
          marginBottom: '1rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: '0.65rem',
          textAlign: 'left',
        }}
      >
        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
            🏛️ Stripe (2.9% + 30p)
          </div>
          <div className="mono-num" style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--danger)' }}>
            {formatGBP(stripeMonthly)}/mo fee
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
            ◎ Standard Web (0.5% · Max £50)
          </div>
          <div className="mono-num" style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {formatGBP(webMonthlyFee)}/mo fee
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-cyan)' }}>
            📱 Solana Seeker (0.25% · Max £5)
          </div>
          <div className="mono-num" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--success)' }}>
            {formatGBP(seekerMonthlyFee)}/mo fee
          </div>
        </div>
      </div>

      <div className="savings-highlight">
        <p className="savings-highlight-copy">
          In <strong>{isSeeker ? 'Solana Seeker Mode (0.25% · Max £5)' : 'Standard Web Mode (0.50% · Max £50)'}</strong>, you pay only{' '}
          <strong>{formatGBP(activeMonthlyFee)}/mo</strong> and save{' '}
          <strong>{formatGBP(savedMonth)}/mo</strong> vs Stripe (2.9% + 30p) across{' '}
          {invoicesPerMonth} invoice{invoicesPerMonth === 1 ? '' : 's'} of ~£{AVG_INVOICE}.
        </p>
        <div className="savings-year-total">
          <span className="amount">{formatGBP(savedYear)}</span>
          <span className="suffix">saved in 1 year — £0/mo subscription forever 🐙⚡</span>
        </div>
      </div>

      <div
        className="savings-future-grid"
        role="grid"
        aria-label="Projected savings over 3, 5, and 10 years at this monthly volume"
      >
        {[
          { label: '3 years', value: saved3y, accent: '🐚' },
          { label: '5 years', value: saved5y, highlight: true, accent: '📱' },
          { label: '10 years', value: saved10y, accent: '🐋' },
        ].map((row) => (
          <div
            key={row.label}
            role="gridcell"
            className={`savings-future-cell${row.highlight ? ' highlight' : ''}`}
          >
            <div className="savings-future-label">
              {row.accent} {row.label}
            </div>
            <div className="savings-future-value">{formatGBP(row.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
