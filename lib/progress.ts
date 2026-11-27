/**
 * Account progress badges. Derived only from a creator's own invoice counts
 * returned by the server, so they persist across devices and browsers.
 * Nonfinancial: they never change fees, limits or eligibility.
 */
export interface ProgressBadge {
  id: 'first-invoice' | 'first-settled' | 'five-settled' | 'twenty-five-settled';
  label: string;
  description: string;
  earned: boolean;
}

export interface ProgressSummary {
  badges: ProgressBadge[];
  earnedCount: number;
  next: { label: string; remaining: number } | null;
}

const SETTLED_STEPS: Array<{ id: ProgressBadge['id']; at: number; label: string }> = [
  { id: 'first-settled', at: 1, label: 'First invoice settled' },
  { id: 'five-settled', at: 5, label: '5 invoices settled' },
  { id: 'twenty-five-settled', at: 25, label: '25 invoices settled' },
];

function count(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

export function computeProgress(input: { totalInvoices?: number; paidInvoices?: number }): ProgressSummary {
  const total = count(input.totalInvoices);
  const paid = count(input.paidInvoices);
  const badges: ProgressBadge[] = [
    {
      id: 'first-invoice',
      label: 'First invoice created',
      description: 'You created an invoice.',
      earned: total >= 1,
    },
    ...SETTLED_STEPS.map((s) => ({
      id: s.id,
      label: s.label,
      description: `${s.at === 1 ? 'An invoice' : `${s.at} invoices`} you created ${s.at === 1 ? 'has' : 'have'} been paid and verified.`,
      earned: paid >= s.at,
    })),
  ];
  const nextStep = SETTLED_STEPS.find((s) => paid < s.at);
  return {
    badges,
    earnedCount: badges.filter((b) => b.earned).length,
    next: nextStep ? { label: nextStep.label, remaining: nextStep.at - paid } : null,
  };
}
