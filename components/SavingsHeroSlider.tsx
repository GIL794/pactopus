'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
  STRIPE_FIXED_PER_INVOICE_GBP,
  STRIPE_FEE_BPS_DECIMAL,
  PLATFORM_FEE_BPS_DECIMAL,
} from '@/lib/billing';

/** React.CSSProperties extended with Pactopus custom CSS variable names used
 *  inline on the slider bubble/track. Keeping this interface avoids `as any`
 *  casts on every style object.
 */
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
  const [monthly, setMonthly] = useState(5000);
  const MIN = 100;
  const MAX = 50000;
  const STEP = 100;
  const AVG_INVOICE = 500;

  const {
    invoicesPerMonth,
    savedMonth,
    savedYear,
    saved3y,
    saved5y,
    saved10y,
  } = useMemo(() => {
    const inv = Math.max(1, Math.round(monthly / AVG_INVOICE));
    const stripeMonthly =
      inv * STRIPE_FIXED_PER_INVOICE_GBP + monthly * STRIPE_FEE_BPS_DECIMAL;
    const pactopusMonthly = monthly * PLATFORM_FEE_BPS_DECIMAL;
    const sMonth = Math.max(0, stripeMonthly - pactopusMonthly);
    return {
      invoicesPerMonth: inv,
      savedMonth: sMonth,
      savedYear: sMonth * 12,
      saved3y: sMonth * 36,
      saved5y: sMonth * 60,
      saved10y: sMonth * 120,
    };
  }, [monthly, AVG_INVOICE]);

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
          <p className="savings-kicker">🐙 Savings — built into every invoice</p>
          <h3 className="savings-title" id="savings-heading">
            Drag the slider. See how much you keep vs Stripe.
          </h3>
          <p className="savings-purpose" id="savings-purpose">
            Tell us your monthly invoicing volume. We&apos;ll compare Pactopus (0.5%) against
            Stripe&apos;s 2.9% + 30p per invoice — every pound saved is a pound in your pocket.
          </p>
          <div className="savings-drag-hint" aria-hidden>
            <span className="savings-drag-hint-icon">👆</span>
            <span>
              <strong>Drag left</strong> for micro-freelancers ·
              <strong>Drag right</strong> for studios and agencies
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
            <span className="savings-axis-sub">tide pool · micro</span>
          </div>
          <div className="savings-axis-marker mid">
            <span className="savings-axis-pin" aria-hidden />
            <span className="savings-axis-label">
              <em>Mid</em> £{((MIN + MAX) / 2).toLocaleString()}
            </span>
            <span className="savings-axis-sub">reef · studio</span>
          </div>
          <div className="savings-axis-marker end">
            <span className="savings-axis-pin" aria-hidden />
            <span className="savings-axis-label">
              <em>End</em> £{MAX.toLocaleString()}
            </span>
            <span className="savings-axis-sub">deep ocean · agency</span>
          </div>
        </div>
      </div>

      <div className="savings-highlight">
        <p className="savings-highlight-copy">
          You save{' '}
          <strong>{formatGBP(savedMonth)}/mo</strong> vs Stripe (2.9% + 30p) on{' '}
          {invoicesPerMonth} invoice{invoicesPerMonth === 1 ? '' : 's'} of ~£{AVG_INVOICE} —
          enough to treat all 3 hearts to something nice 💛❤️💙
        </p>
        <div className="savings-year-total">
          <span className="amount">{formatGBP(savedYear)}</span>
          <span className="suffix">saved in 1 year — cha-ching 🐙💰</span>
        </div>
      </div>

      <div
        className="savings-future-grid"
        role="grid"
        aria-label="Projected savings over 3, 5, and 10 years at this monthly volume"
      >
        {[
          { label: '3 years', value: saved3y, accent: '🐚' },
          { label: '5 years', value: saved5y, highlight: true, accent: '🦑' },
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
