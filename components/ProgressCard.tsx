import { computeProgress } from '@/lib/progress';

export default function ProgressCard({ totalInvoices, paidInvoices }: { totalInvoices?: number; paidInvoices?: number }) {
  const progress = computeProgress({ totalInvoices, paidInvoices });
  return (
    <div className="stat-card" style={{ marginBottom: '1rem' }} data-testid="progress-card">
      <div className="stat-label">Progress · {progress.earnedCount} of {progress.badges.length}</div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        {progress.badges.map((b) => (
          <span key={b.id} title={b.description} className={b.earned ? 'badge badge-green' : 'badge'} style={{ fontSize: '0.7rem', opacity: b.earned ? 1 : 0.55 }}>
            {b.earned ? '✓ ' : ''}{b.label}
          </span>
        ))}
      </div>
      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
        {progress.next ? `${progress.next.remaining} more paid invoice${progress.next.remaining === 1 ? '' : 's'} to “${progress.next.label}”.` : 'All badges earned.'} Badges are saved to your account and do not change fees.
      </div>
    </div>
  );
}
