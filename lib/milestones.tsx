'use client';

import toast from 'react-hot-toast';

type MilestoneKey =
  | 'first_wallet_connect'
  | 'first_invoice_created'
  | 'first_payment_completed'
  | 'first_dashboard_visit'
  | 'thirty_day_streak';

const STORAGE_KEY = 'pactopus_milestones_v1';
const FUN_MODE_KEY = 'pactopus_fun_mode';
const ACTIVE_DAYS_KEY = 'pactopus_active_days_v1';

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readState(): Partial<Record<MilestoneKey, number>> {
  if (typeof window === 'undefined') return {};
  return safeParse(window.localStorage.getItem(STORAGE_KEY), {} as Partial<Record<MilestoneKey, number>>);
}

function writeState(state: Partial<Record<MilestoneKey, number>>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function isFunModeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(FUN_MODE_KEY) === 'true';
}

export function setFunModeEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FUN_MODE_KEY, enabled ? 'true' : 'false');
}

export function trackDailyUsage() {
  if (typeof window === 'undefined') return;

  const today = new Date();
  const dayKey = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
  const days = safeParse<string[]>(window.localStorage.getItem(ACTIVE_DAYS_KEY), []);

  if (!days.includes(dayKey)) {
    const next = [...days, dayKey].slice(-45);
    window.localStorage.setItem(ACTIVE_DAYS_KEY, JSON.stringify(next));
    if (next.length >= 30) {
      recordMilestone('thirty_day_streak');
    }
  }
}

function messageFor(key: MilestoneKey) {
  switch (key) {
    case 'first_wallet_connect':
      return { title: 'Nice! Wallet connected.', body: 'You’re ready to create your first invoice.' };
    case 'first_invoice_created':
      return { title: 'First invoice created!', body: 'That’s one more tentacle doing the work for you.' };
    case 'first_payment_completed':
      return { title: 'Payment complete!', body: 'Smooth, fast, and recorded on-chain.' };
    case 'first_dashboard_visit':
      return { title: 'Welcome to your dashboard.', body: 'Your invoices, neatly organized.' };
    case 'thirty_day_streak':
      return { title: '30-day streak!', body: 'Consistent creator energy. Keep going.' };
  }
}

export function recordMilestone(key: MilestoneKey): boolean {
  const state = readState();
  if (state[key]) return false;

  state[key] = Date.now();
  writeState(state);

  if (!isFunModeEnabled()) return true;

  const msg = messageFor(key);
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
          <div style={{ fontWeight: 800, marginBottom: '0.15rem' }}>{msg.title}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.4 }}>{msg.body}</div>
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

  return true;
}
