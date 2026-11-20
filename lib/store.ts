import fs from 'fs';
import path from 'path';
import { Currency } from './arc';
import { prisma, isCloudDbEnabled } from './db';
import { safeLogger } from './log-redact';
import { SUBSCRIPTION_LIMITS as BILLING_LIMITS } from './billing';
import { decimalToUnits, unitsToDecimalString } from './arc-settlement';

export type InvoiceStatus = 'pending' | 'paid' | 'expired';

export interface Invoice {
  id: string;
  ownerAddress: string;
  amount: string;
  currency: Currency;
  description: string;
  recipientAddress: string;
  recipientName?: string;
  createdAt: string;
  expiresAt?: string;
  status: InvoiceStatus;
  txHash?: string;
  feeTxHash?: string;
  paidAt?: string;
  paidBy?: string;
  fee?: string;
  network: 'arc' | 'algorand';
  isSystem?: boolean;
}

export interface MonthlyUsageInfo {
  ownerAddress: string;
  network: 'arc' | 'algorand';
  billingMonth: string;
  invoicesUsed: number;
  invoicesAllowed: number;
  tier: 'free' | 'pro' | 'business';
  billingCycleStart: string;
  billingCycleEnd: string;
}

export { BILLING_LIMITS as SUBSCRIPTION_LIMITS };

const DB_DIR = path.join(process.cwd(), 'db');
const DB_FILE = path.join(DB_DIR, 'invoices.json');
const USAGE_FILE = path.join(DB_DIR, 'usage.json');

export function isInvoiceExpired(invoice: Pick<Invoice, 'status' | 'expiresAt'>): boolean {
  if (invoice.status === 'paid') return false;
  if (invoice.status === 'expired') return true;
  if (!invoice.expiresAt) return false;
  const expiryMs = new Date(invoice.expiresAt).getTime();
  return Number.isFinite(expiryMs) && expiryMs <= Date.now();
}

function applyEffectiveExpiry(inv: Invoice): Invoice {
  if (inv.status === 'pending' && isInvoiceExpired(inv)) {
    return { ...inv, status: 'expired' };
  }
  return inv;
}

export function getDemoData(): Invoice[] {
  const now = Date.now();
  const owner = 'SYSTEM_SAMPLE_PREVIEW';
  return [
    {
      id: 'arc-001',
      ownerAddress: owner,
      amount: '1500.00',
      currency: 'USDC',
      description: 'Brand Strategy Consulting — Q3 2025',
      recipientAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      recipientName: 'Kyrvyn Studio',
      createdAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'paid',
      txHash: '0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1',
      paidAt: new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(),
      paidBy: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      fee: '7.50',
      network: 'arc',
      isSystem: true,
    },
    {
      id: 'arc-002',
      ownerAddress: owner,
      amount: '850.00',
      currency: 'EURC',
      description: 'Website Design — Homepage Redesign',
      recipientAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      recipientName: 'Kyrvyn Studio',
      createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'paid',
      txHash: '0xdef456abc123def456abc123def456abc123def456abc123def456abc123def4',
      paidAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      paidBy: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      fee: '4.25',
      network: 'arc',
      isSystem: true,
    },
    {
      id: 'arc-003',
      ownerAddress: owner,
      amount: '2200.00',
      currency: 'USDC',
      description: 'Monthly Retainer — Product Advisory',
      recipientAddress: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
      recipientName: 'Kyrvyn Studio',
      createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
      network: 'arc',
      isSystem: true,
    },
    {
      id: 'algo-001',
      ownerAddress: owner,
      amount: '3200.00',
      currency: 'USDC',
      description: 'Solidity to TEAL Port — smart contract audit',
      recipientAddress: 'J32G7FGD4S6A3R2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7TS',
      recipientName: 'Kyrvyn Studio',
      createdAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'paid',
      txHash: 'T2G7FGD4S6A3R2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7T8S1A2B3C',
      paidAt: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
      paidBy: 'P2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7T8S1A2B3C4D5E6F7G8H9',
      fee: '16.00',
      network: 'algorand',
      isSystem: true,
    },
    {
      id: 'algo-002',
      ownerAddress: owner,
      amount: '1250.00',
      currency: 'USDC',
      description: 'dApp Frontend Deployment on Algorand',
      recipientAddress: 'J32G7FGD4S6A3R2R5H7P7KP7N5L2G5F4F5E6D7C8B9A1Z2Y3X4W5V6U7TS',
      recipientName: 'Kyrvyn Studio',
      createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
      network: 'algorand',
      isSystem: true,
    },
  ];
}

export function billingMonthKeyFor(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function billingCycleBoundsFor(billingMonth: string): { start: Date; end: Date } {
  const [yStr, mStr] = billingMonth.split('-');
  const year = parseInt(yStr, 10);
  const monthZeroIdx = parseInt(mStr, 10) - 1;
  const start = new Date(year, monthZeroIdx, 1, 0, 0, 0, 0);
  const end = new Date(year, monthZeroIdx + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

function ensureDbDir() {
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  } catch (err) {
    safeLogger.warn('[Store] ensureDbDir failed', err);
  }
}

function isStrictDbMode(): boolean {
  if (process.env.PACTOPUS_ALLOW_DEMO_STORE_FALLBACK === '1') return false;
  if (process.env.NODE_ENV === 'production') return true;
  if (process.env.DATABASE_URL) return true;
  return false;
}

function allowLocalWrites(): boolean {
  return process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
}

function readLocalDatabase(): Map<string, Invoice> {
  const map = new Map<string, Invoice>();
  try {
    ensureDbDir();
    if (!fs.existsSync(DB_FILE)) {
      const demos = getDemoData();
      if (allowLocalWrites()) {
        fs.writeFileSync(DB_FILE, JSON.stringify(demos, null, 2), 'utf-8');
      }
      demos.forEach((inv) => map.set(inv.id, applyEffectiveExpiry(inv)));
      return map;
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed: Invoice[] = JSON.parse(data);
    parsed.forEach((inv) => map.set(inv.id, applyEffectiveExpiry(inv)));
  } catch (err) {
    safeLogger.warn('[Store] Failed to read local database:', err);
  }
  return map;
}

function writeLocalDatabase(map: Map<string, Invoice>) {
  if (!allowLocalWrites()) return;
  try {
    ensureDbDir();
    const arr = Array.from(map.values());
    fs.writeFileSync(DB_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (err) {
    safeLogger.warn('[Store] Failed to write local database:', err);
  }
}

interface LocalUsageStoreShape {
  [compositeKey: string]: {
    ownerAddress: string;
    network: 'arc' | 'algorand';
    billingMonth: string;
    invoicesUsed: number;
    updatedAt: string;
  };
}

function usageKey(ownerAddress: string, network: 'arc' | 'algorand', billingMonth: string): string {
  return `${ownerAddress}|${network}|${billingMonth}`;
}

function readLocalUsage(): LocalUsageStoreShape {
  try {
    ensureDbDir();
    if (!fs.existsSync(USAGE_FILE)) {
      const fresh: LocalUsageStoreShape = {};
      if (allowLocalWrites()) {
        fs.writeFileSync(USAGE_FILE, JSON.stringify(fresh, null, 2), 'utf-8');
      }
      return fresh;
    }
    const data = fs.readFileSync(USAGE_FILE, 'utf-8');
    return JSON.parse(data) as LocalUsageStoreShape;
  } catch (err) {
    safeLogger.warn('[Store] Failed to read local usage store:', err);
    return {};
  }
}

function writeLocalUsage(store: LocalUsageStoreShape) {
  if (!allowLocalWrites()) return;
  try {
    ensureDbDir();
    fs.writeFileSync(USAGE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    safeLogger.warn('[Store] Failed to write local usage store:', err);
  }
}

export function generateInvoiceId(): string {
  return `inv-${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;
}

interface PrismaInvoiceRowShape {
  id: string;
  ownerAddress?: unknown;
  amount: string;
  currency: string;
  description: string;
  recipientAddress: string;
  recipientName?: unknown;
  createdAt: unknown;
  expiresAt?: unknown;
  status: unknown;
  txHash?: unknown;
  feeTxHash?: unknown;
  paidAt?: unknown;
  paidBy?: unknown;
  fee?: unknown;
  network: unknown;
  isSystem?: unknown;
}

function formatDbInvoice(row: PrismaInvoiceRowShape): Invoice {
  const toIso = (v: unknown): string | undefined => {
    if (v === null || v === undefined) return undefined;
    if (v instanceof Date) return v.toISOString();
    const s = String(v);
    return s || undefined;
  };
  const normStatus = String(row.status || 'pending') as InvoiceStatus;
  const inv: Invoice = {
    id: row.id,
    ownerAddress: String(row.ownerAddress || ''),
    amount: String(row.amount),
    currency: String(row.currency) as Currency,
    description: String(row.description),
    recipientAddress: String(row.recipientAddress),
    recipientName: row.recipientName ? String(row.recipientName) : undefined,
    createdAt: toIso(row.createdAt) ?? new Date().toISOString(),
    expiresAt: toIso(row.expiresAt),
    status: (['pending', 'paid', 'expired'] as const).includes(normStatus) ? normStatus : 'pending',
    txHash: row.txHash ? String(row.txHash) : undefined,
    feeTxHash: row.feeTxHash ? String(row.feeTxHash) : undefined,
    paidAt: toIso(row.paidAt),
    paidBy: row.paidBy ? String(row.paidBy) : undefined,
    fee: row.fee ? String(row.fee) : undefined,
    network: String(row.network) === 'algorand' ? 'algorand' : 'arc',
    isSystem: Boolean(row.isSystem),
  };
  return applyEffectiveExpiry(inv);
}

export async function getSubscriptionTier(ownerAddress: string): Promise<'free' | 'pro' | 'business'> {
  const normalizedOwner = (ownerAddress || '').trim();
  if (!normalizedOwner) return 'free';
  if (isCloudDbEnabled && prisma) {
    try {
      const row = await prisma.subscription.findUnique({ where: { address: normalizedOwner } });
      const tier = row?.tier;
      if (tier === 'pro' || tier === 'business' || tier === 'free') return tier;
    } catch (err) {
      if (isStrictDbMode()) {
        safeLogger.error('[Store] Prisma getSubscriptionTier FAILED in strict DB mode — throwing upward (HTTP 503 expected):', err);
        const wrapped = new Error(
          `[Store:strict] Postgres unreachable in strict DB mode (getSubscriptionTier). Set PACTOPUS_ALLOW_DEMO_STORE_FALLBACK=1 to permit local JSON demo fallbacks. Cause: ${(err as Error)?.message || String(err)}`
        );
        wrapped.name = 'StoreStrictDbError';
        throw wrapped;
      }
      safeLogger.warn('[Store] Prisma getSubscriptionTier failed, fallback to free:', err);
    }
  }
  return 'free';
}

export async function getMonthlyUsage(
  ownerAddress: string,
  network: 'arc' | 'algorand',
  billingMonth?: string
): Promise<MonthlyUsageInfo> {
  const normalizedOwner = (ownerAddress || '').trim();
  const monthKey = billingMonth || billingMonthKeyFor(new Date());
  const { start, end } = billingCycleBoundsFor(monthKey);
  const tier = await getSubscriptionTier(normalizedOwner);
  const invoicesAllowed = BILLING_LIMITS[tier];

  let invoicesUsed = 0;
  if (normalizedOwner) {
    if (isCloudDbEnabled && prisma) {
      try {
        const record = await prisma.invoiceUsage.findUnique({
          where: {
            ownerAddress_network_billingMonth: {
              ownerAddress: normalizedOwner,
              network,
              billingMonth: monthKey,
            },
          },
        });
        if (record) {
          invoicesUsed = Math.max(0, Number(record.invoicesUsed) || 0);
        } else {
          const invoicesInCycle = await prisma.invoice.count({
            where: {
              ownerAddress: normalizedOwner,
              network,
              isSystem: false,
              createdAt: { gte: start, lt: end },
            },
          });
          invoicesUsed = invoicesInCycle || 0;
          try {
            await prisma.invoiceUsage.upsert({
              where: {
                ownerAddress_network_billingMonth: {
                  ownerAddress: normalizedOwner,
                  network,
                  billingMonth: monthKey,
                },
              },
              update: { invoicesUsed },
              create: {
                ownerAddress: normalizedOwner,
                network,
                billingMonth: monthKey,
                invoicesUsed,
              },
            });
          } catch (upsertErr) {
            safeLogger.debug('[Store] getMonthlyUsage counter upsert race (benign):', upsertErr);
          }
        }
      } catch (err) {
        if (isStrictDbMode()) {
          safeLogger.error('[Store] Prisma getMonthlyUsage FAILED in strict DB mode — throwing upward (HTTP 503 expected):', err);
          const wrapped = new Error(
            `[Store:strict] Postgres unreachable in strict DB mode (getMonthlyUsage). Set PACTOPUS_ALLOW_DEMO_STORE_FALLBACK=1 to permit local JSON demo fallbacks. Cause: ${(err as Error)?.message || String(err)}`
          );
          wrapped.name = 'StoreStrictDbError';
          throw wrapped;
        }
        safeLogger.warn('[Store] Prisma getMonthlyUsage failed, fallback to local store:', err);
      }
    } else {
      const localUsage = readLocalUsage();
      const key = usageKey(normalizedOwner, network, monthKey);
      const record = localUsage[key];
      if (record) {
        invoicesUsed = Math.max(0, Number(record.invoicesUsed) || 0);
      } else {
        const db = readLocalDatabase();
        for (const inv of db.values()) {
          if (inv.isSystem) continue;
          if ((inv.ownerAddress || '') !== normalizedOwner) continue;
          if (inv.network !== network) continue;
          const created = new Date(inv.createdAt).getTime();
          if (created >= start.getTime() && created < end.getTime()) invoicesUsed++;
        }
        localUsage[key] = {
          ownerAddress: normalizedOwner,
          network,
          billingMonth: monthKey,
          invoicesUsed,
          updatedAt: new Date().toISOString(),
        };
        writeLocalUsage(localUsage);
      }
    }
  }

  safeLogger.info(
    `[invoice_usage:get] owner=${normalizedOwner || '(none)'} network=${network} month=${monthKey} used=${invoicesUsed}/${invoicesAllowed} tier=${tier}`
  );

  return {
    ownerAddress: normalizedOwner,
    network,
    billingMonth: monthKey,
    invoicesUsed,
    invoicesAllowed,
    tier,
    billingCycleStart: start.toISOString(),
    billingCycleEnd: end.toISOString(),
  };
}

async function incrementMonthlyUsage(
  ownerAddress: string,
  network: 'arc' | 'algorand',
  billingMonth: string,
  invoiceId: string
): Promise<number> {
  const normalizedOwner = (ownerAddress || '').trim();
  if (!normalizedOwner) return 0;

  if (isCloudDbEnabled && prisma) {
    try {
      let nextUsed = 1;
      if (prisma.$transaction) {
        await prisma.$transaction([
          prisma.invoiceUsage.upsert({
            where: {
              ownerAddress_network_billingMonth: {
                ownerAddress: normalizedOwner,
                network,
                billingMonth,
              },
            },
            update: {
              invoicesUsed: { increment: 1 },
            },
            create: {
              ownerAddress: normalizedOwner,
              network,
              billingMonth,
              invoicesUsed: 1,
            },
          }),
        ]);
        const refreshed = await prisma.invoiceUsage.findUnique({
          where: {
            ownerAddress_network_billingMonth: {
              ownerAddress: normalizedOwner,
              network,
              billingMonth,
            },
          },
        });
        nextUsed = Math.max(1, Number(refreshed?.invoicesUsed ?? 1));
      } else {
        const existing = await prisma.invoiceUsage.findUnique({
          where: {
            ownerAddress_network_billingMonth: {
              ownerAddress: normalizedOwner,
              network,
              billingMonth,
            },
          },
        });
        if (!existing) {
          await prisma.invoiceUsage.create({
            data: {
              ownerAddress: normalizedOwner,
              network,
              billingMonth,
              invoicesUsed: 1,
            },
          });
          nextUsed = 1;
        } else {
          nextUsed = Math.max(0, Number(existing.invoicesUsed) || 0) + 1;
          await prisma.invoiceUsage.update({
            where: {
              ownerAddress_network_billingMonth: {
                ownerAddress: normalizedOwner,
                network,
                billingMonth,
              },
            },
            data: { invoicesUsed: nextUsed },
          });
        }
      }

      try {
        await prisma.agentLog.create({
          data: {
            action: 'invoice_usage:increment',
            details: JSON.stringify({
              ownerAddress: normalizedOwner,
              network,
              billingMonth,
              invoiceId,
              invoicesUsedAfter: nextUsed,
            }),
            status: 'success',
          },
        });
      } catch (logErr) {
        safeLogger.debug('[Store] audit log best-effort failed (usage increment):', logErr);
      }
      safeLogger.info(
        `[invoice_usage:increment] owner=${normalizedOwner} network=${network} month=${billingMonth} invoice=${invoiceId} used_after=${nextUsed}`
      );
      return nextUsed;
    } catch (err) {
      if (isStrictDbMode()) {
        safeLogger.error('[Store] Prisma incrementMonthlyUsage FAILED in strict DB mode — throwing upward (HTTP 503 expected):', err);
        const wrapped = new Error(
          `[Store:strict] Postgres unreachable in strict DB mode (incrementMonthlyUsage). Set PACTOPUS_ALLOW_DEMO_STORE_FALLBACK=1 to permit local JSON demo fallbacks. Cause: ${(err as Error)?.message || String(err)}`
        );
        wrapped.name = 'StoreStrictDbError';
        throw wrapped;
      }
      safeLogger.warn('[Store] Prisma incrementMonthlyUsage failed, fallback to local:', err);
    }
  }

  const local = readLocalUsage();
  const key = usageKey(normalizedOwner, network, billingMonth);
  const current = local[key] ? Math.max(0, Number(local[key].invoicesUsed) || 0) : 0;
  const nextUsed = current + 1;
  local[key] = {
    ownerAddress: normalizedOwner,
    network,
    billingMonth,
    invoicesUsed: nextUsed,
    updatedAt: new Date().toISOString(),
  };
  writeLocalUsage(local);
  safeLogger.info(
    `[invoice_usage:increment:local] owner=${normalizedOwner} network=${network} month=${billingMonth} invoice=${invoiceId} used_after=${nextUsed}`
  );
  return nextUsed;
}

export async function createInvoice(
  data: Omit<Invoice, 'id' | 'createdAt' | 'status' | 'ownerAddress' | 'isSystem'> & { ownerAddress?: string; expiresAt?: string }
): Promise<Invoice> {
  const id = generateInvoiceId();
  const now = new Date();
  const monthKey = billingMonthKeyFor(now);
  const network = (data.network || 'arc') as 'arc' | 'algorand';
  const normalizedOwner = (data.ownerAddress || '').trim();
  let tier: 'free' | 'pro' | 'business' = 'free';

  if (normalizedOwner) {
    tier = await getSubscriptionTier(normalizedOwner);
    const usage = await getMonthlyUsage(normalizedOwner, network, monthKey);
    if (tier !== 'business' && usage.invoicesUsed >= usage.invoicesAllowed) {
      safeLogger.warn(
        `[invoice_usage:limit_reached] owner=${normalizedOwner} network=${network} month=${monthKey} used=${usage.invoicesUsed}/${usage.invoicesAllowed} tier=${tier}`
      );
      if (isCloudDbEnabled && prisma) {
        try {
          await prisma.agentLog.create({
            data: {
              action: 'invoice_usage:limit_reached',
              details: JSON.stringify({
                ownerAddress: normalizedOwner,
                network,
                billingMonth: monthKey,
                invoicesUsed: usage.invoicesUsed,
                invoicesAllowed: usage.invoicesAllowed,
                tier,
              }),
              status: 'blocked',
            },
          });
        } catch (auditErr) {
          safeLogger.debug('[Store] limit-reached audit log best-effort failed:', auditErr);
        }
      }
      const errorMessage =
        `Free tier limit of ${usage.invoicesAllowed} invoices/month reached for ${network}. ` +
        `You used ${usage.invoicesUsed}. Upgrade to Pro/Business for higher limits.`;
      throw new Error(errorMessage);
    }
  }

  const expiresAtDt: Date | null = data.expiresAt ? new Date(data.expiresAt) : null;
  const initialStatus: InvoiceStatus = expiresAtDt && expiresAtDt.getTime() <= now.getTime() ? 'expired' : 'pending';
  const common: Invoice = {
    id,
    ownerAddress: normalizedOwner,
    amount: data.amount,
    currency: data.currency,
    description: data.description,
    recipientAddress: data.recipientAddress,
    recipientName: data.recipientName,
    network,
    createdAt: now.toISOString(),
    expiresAt: expiresAtDt ? expiresAtDt.toISOString() : undefined,
    status: initialStatus,
    isSystem: false,
  };

  if (isCloudDbEnabled && prisma) {
    try {
      const created = await prisma.invoice.create({
        data: {
          id: common.id,
          ownerAddress: common.ownerAddress,
          amount: common.amount,
          currency: common.currency,
          description: common.description,
          recipientAddress: common.recipientAddress,
          recipientName: common.recipientName || null,
          network: common.network,
          status: initialStatus,
          createdAt: now,
          expiresAt: expiresAtDt,
          isSystem: false,
        },
      });
      if (normalizedOwner) {
        await incrementMonthlyUsage(normalizedOwner, network, monthKey, id);
      }
      if (isCloudDbEnabled && prisma) {
        try {
          await prisma.agentLog.create({
            data: {
              action: 'invoice:created',
              details: JSON.stringify({
                ownerAddress: normalizedOwner || '(anonymous)',
                network,
                billingMonth: monthKey,
                invoiceId: id,
                amount: common.amount,
                currency: common.currency,
                tier,
              }),
              status: 'success',
            },
          });
        } catch (auditErr) {
          safeLogger.debug('[Store] invoice-created audit log best-effort failed:', auditErr);
        }
      }
      return formatDbInvoice(created);
    } catch (err) {
      if (err instanceof Error && /limit of \d+ invoices/i.test(err.message)) {
        throw err;
      }
      if (isStrictDbMode()) {
        safeLogger.error('[Store] Prisma createInvoice FAILED in strict DB mode — throwing upward (HTTP 503 expected):', err);
        const wrapped = new Error(
          `[Store:strict] Postgres unreachable in strict DB mode (createInvoice). Set PACTOPUS_ALLOW_DEMO_STORE_FALLBACK=1 to permit local JSON demo fallbacks. Cause: ${(err as Error)?.message || String(err)}`
        );
        wrapped.name = 'StoreStrictDbError';
        throw wrapped;
      }
      safeLogger.warn('[Store] Prisma createInvoice failed, fallback to local storage:', err);
    }
  }

  // Local fallback: still enforce limit counter
  if (normalizedOwner) {
    await incrementMonthlyUsage(normalizedOwner, network, monthKey, id);
  }
  const db = readLocalDatabase();
  db.set(id, common);
  writeLocalDatabase(db);
  return common;
}

export async function getInvoice(id: string): Promise<Invoice | undefined> {
  if (isCloudDbEnabled && prisma) {
    try {
      const row = await prisma.invoice.findUnique({ where: { id } });
      if (row) {
        const formatted = formatDbInvoice(row);
        if (row.status === 'pending' && formatted.status === 'expired') {
          try {
            await prisma.invoice.update({ where: { id }, data: { status: 'expired' } });
          } catch { /* best-effort status transition */ }
        }
        return formatted;
      }
    } catch (err) {
      safeLogger.warn('[Store] Prisma getInvoice failed, fallback to local:', err);
    }
  }
  const db = readLocalDatabase();
  const inv = db.get(id);
  if (!inv) return undefined;
  const checked = applyEffectiveExpiry(inv);
  if (checked.status !== inv.status) {
    db.set(id, checked);
    writeLocalDatabase(db);
  }
  return checked;
}

export async function isTxHashUsed(txHash: string, excludeInvoiceId?: string): Promise<boolean> {
  if (isCloudDbEnabled && prisma) {
    try {
      const match = await prisma.invoice.findFirst({
        where: {
          OR: [{ txHash }, { feeTxHash: txHash }],
          ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
        },
      });
      return Boolean(match);
    } catch (err) {
      safeLogger.warn('[Store] Prisma isTxHashUsed check failed:', err);
    }
  }
  const db = readLocalDatabase();
  for (const inv of db.values()) {
    if (inv.id !== excludeInvoiceId && ((inv.txHash && inv.txHash.toLowerCase() === txHash.toLowerCase()) || (inv.feeTxHash && inv.feeTxHash.toLowerCase() === txHash.toLowerCase()))) {
      return true;
    }
  }
  return false;
}

export async function getAllInvoices(
  network?: 'arc' | 'algorand',
  ownerAddress?: string
): Promise<Invoice[]> {
  const normalizedOwner = ownerAddress ? ownerAddress.trim() : '';
  if (isCloudDbEnabled && prisma) {
    try {
      const rows = await prisma.invoice.findMany({
        take: 100,
        select: {
          id: true,
          ownerAddress: true,
          amount: true,
          currency: true,
          description: true,
          recipientAddress: true,
          recipientName: true,
          createdAt: true,
          expiresAt: true,
          status: true,
          txHash: true,
          feeTxHash: true,
          paidAt: true,
          paidBy: true,
          fee: true,
          network: true,
          isSystem: true,
        },
        where: {
          ...(network ? { network } : {}),
          ...(normalizedOwner ? { ownerAddress: normalizedOwner, isSystem: false } : { isSystem: false }),
        },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((r) => formatDbInvoice(r as PrismaInvoiceRowShape));
    } catch (err) {
      if (isStrictDbMode()) {
        safeLogger.error('[Store] Prisma getAllInvoices FAILED in strict DB mode — throwing upward (HTTP 503 expected):', err);
        const wrapped = new Error(
          `[Store:strict] Postgres unreachable in strict DB mode (getAllInvoices). Set PACTOPUS_ALLOW_DEMO_STORE_FALLBACK=1 to permit local JSON demo fallbacks. Cause: ${(err as Error)?.message || String(err)}`
        );
        wrapped.name = 'StoreStrictDbError';
        throw wrapped;
      }
      safeLogger.warn('[Store] Prisma getAllInvoices failed, fallback to local:', err);
    }
  }

  const db = readLocalDatabase();
  const arr = Array.from(db.values());
  const filtered = arr.filter((inv) => {
    if (network && inv.network !== network) return false;
    if (normalizedOwner) return !inv.isSystem && inv.ownerAddress === normalizedOwner;
    return !inv.isSystem;
  });
  return filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function markInvoicePaid(
  id: string,
  txHash: string,
  paidBy: string,
  fee: string,
  feeTxHash?: string
): Promise<Invoice | null> {
  const now = new Date();

  if (!txHash) {
    throw new Error('[Store:markInvoicePaid] txHash is required for double-spend idempotency.');
  }

  if (isCloudDbEnabled && prisma) {
    try {
      const existing = await prisma.invoice.findUnique({ where: { id }, select: { status: true, txHash: true, expiresAt: true } });
      if (!existing) {
        return null;
      }
      if (existing.status === 'paid') {
        if (existing.txHash && existing.txHash.toLowerCase() !== txHash.toLowerCase()) {
          safeLogger.warn(
            `[Store:markInvoicePaid] invoice id=${id} already marked paid with different txHash. Ignoring overwrite request. existing=${existing.txHash} new=${txHash}`
          );
        }
        const fullExisting = await prisma.invoice.findUnique({ where: { id } });
        return fullExisting ? formatDbInvoice(fullExisting as PrismaInvoiceRowShape) : null;
      }
      if (existing.status === 'expired' || (existing.expiresAt && existing.expiresAt.getTime() <= now.getTime())) {
        throw new Error(`[Store:markInvoicePaid] Invoice ${id} has expired and cannot be marked paid.`);
      }
      const dupUsed = await isTxHashUsed(txHash, id);
      if (dupUsed) {
        throw new Error(
          `[Store:markInvoicePaid] SEC3 double-spend guard: txHash=${txHash} already applied to another invoice. Refusing duplicate settlement.`
        );
      }
      const updated = await prisma.invoice.update({
        where: { id },
        data: {
          status: 'paid',
          txHash,
          feeTxHash: feeTxHash || null,
          paidBy,
          fee,
          paidAt: now,
        },
      });
      return formatDbInvoice(updated);
    } catch (err) {
      if (err instanceof Error && /expired and cannot be marked paid|double-spend guard/i.test(err.message)) {
        throw err;
      }
      if (isStrictDbMode()) {
        safeLogger.error('[Store] Prisma markInvoicePaid FAILED in strict DB mode — throwing upward (HTTP 503 expected):', err);
        const wrapped = new Error(
          `[Store:strict] Postgres unreachable in strict DB mode (markInvoicePaid). Set PACTOPUS_ALLOW_DEMO_STORE_FALLBACK=1 to permit local JSON demo fallbacks. Cause: ${(err as Error)?.message || String(err)}`
        );
        wrapped.name = 'StoreStrictDbError';
        throw wrapped;
      }
      safeLogger.warn('[Store] Prisma markInvoicePaid failed, fallback to local:', err);
    }
  }

  const db = readLocalDatabase();
  const inv = db.get(id);
  if (!inv) return null;
  if (inv.status === 'paid') {
    if (inv.txHash && inv.txHash.toLowerCase() !== txHash.toLowerCase()) {
      safeLogger.warn(
        `[Store:markInvoicePaid:local] invoice id=${id} already marked paid with different txHash. Ignoring. existing=${inv.txHash} new=${txHash}`
      );
    }
    return inv;
  }
  if (isInvoiceExpired(inv)) {
    throw new Error(`[Store:markInvoicePaid:local] Invoice ${id} has expired and cannot be marked paid.`);
  }
  const dupUsedLocal = await isTxHashUsed(txHash, id);
  if (dupUsedLocal) {
    throw new Error(
      `[Store:markInvoicePaid:local] SEC3 double-spend guard: txHash=${txHash} already applied to another invoice. Refusing duplicate settlement.`
    );
  }
  const updated: Invoice = {
    ...inv,
    status: 'paid',
    txHash,
    feeTxHash,
    paidAt: now.toISOString(),
    paidBy,
    fee,
  };
  db.set(id, updated);
  writeLocalDatabase(db);
  return updated;
}

export interface DashboardStats {
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  totalEarnedUSDC: string;
  totalEarnedEURC: string;
  earningsThisMonth: string;
  earningsThisMonthUSDC: string;
  earningsThisMonthEURC: string;
  recentInvoices: Invoice[];
  tier: 'free' | 'pro' | 'business';
  invoicesUsedThisMonth: number;
  invoicesAllowedThisMonth: number;
  billingCycleStart: string;
  billingCycleEnd: string;
}

function safeAddUnits(acc: bigint, amountStr: string): bigint {
  try {
    return acc + decimalToUnits(String(amountStr).trim(), 6);
  } catch {
    const parsed = parseFloat(String(amountStr));
    if (!Number.isFinite(parsed) || parsed <= 0) return acc;
    return acc + BigInt(Math.round(parsed * 1_000_000));
  }
}

export async function getDashboardStats(
  network: 'arc' | 'algorand' = 'arc',
  ownerAddress?: string
): Promise<DashboardStats> {
  const normalizedOwner = ownerAddress ? ownerAddress.trim() : '';
  const usage = await getMonthlyUsage(normalizedOwner, network);

  if (isCloudDbEnabled && prisma) {
    try {
      const { start: monthStart } = billingCycleBoundsFor(usage.billingMonth);
      const whereAll = {
        ...(network ? { network } : {}),
        ...(normalizedOwner ? { ownerAddress: normalizedOwner, isSystem: false } : { isSystem: false }),
      };
      const [totalInvoices, paidRows, monthRows, recentRows] = await Promise.all([
        prisma.invoice.count({ where: whereAll }),
        prisma.invoice.findMany({
          where: { ...whereAll, status: 'paid' },
          select: { currency: true, amount: true, paidAt: true },
        }),
        prisma.invoice.findMany({
          where: {
            ...whereAll,
            status: 'paid',
            paidAt: { gte: monthStart },
          },
          select: { currency: true, amount: true },
        }),
        prisma.invoice.findMany({
          take: 100,
          select: {
            id: true,
            ownerAddress: true,
            amount: true,
            currency: true,
            description: true,
            recipientAddress: true,
            recipientName: true,
            createdAt: true,
            expiresAt: true,
            status: true,
            txHash: true,
            feeTxHash: true,
            paidAt: true,
            paidBy: true,
            fee: true,
            network: true,
            isSystem: true,
          },
          where: whereAll,
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      let totalEarnedUSDCUnits = BigInt(0);
      let totalEarnedEURCUnits = BigInt(0);
      for (const row of paidRows) {
        if (row.currency === 'USDC') totalEarnedUSDCUnits = safeAddUnits(totalEarnedUSDCUnits, String(row.amount));
        else if (row.currency === 'EURC') totalEarnedEURCUnits = safeAddUnits(totalEarnedEURCUnits, String(row.amount));
      }

      let monthUSDCUnits = BigInt(0);
      let monthEURCUnits = BigInt(0);
      for (const row of monthRows) {
        if (row.currency === 'USDC') monthUSDCUnits = safeAddUnits(monthUSDCUnits, String(row.amount));
        else if (row.currency === 'EURC') monthEURCUnits = safeAddUnits(monthEURCUnits, String(row.amount));
      }

      const formattedRecent = recentRows.map((r) => formatDbInvoice(r as PrismaInvoiceRowShape));
      const paidInvoices = paidRows.length;
      const expiredRecentCount = formattedRecent.filter((r) => r.status === 'expired').length;
      const pendingInvoices = Math.max(0, totalInvoices - paidInvoices - expiredRecentCount);

      return {
        totalInvoices,
        paidInvoices,
        pendingInvoices,
        totalEarnedUSDC: unitsToDecimalString(totalEarnedUSDCUnits, 6),
        totalEarnedEURC: unitsToDecimalString(totalEarnedEURCUnits, 6),
        earningsThisMonth: unitsToDecimalString(monthUSDCUnits, 6),
        earningsThisMonthUSDC: unitsToDecimalString(monthUSDCUnits, 6),
        earningsThisMonthEURC: unitsToDecimalString(monthEURCUnits, 6),
        recentInvoices: formattedRecent,
        tier: usage.tier,
        invoicesUsedThisMonth: usage.invoicesUsed,
        invoicesAllowedThisMonth: usage.invoicesAllowed,
        billingCycleStart: usage.billingCycleStart,
        billingCycleEnd: usage.billingCycleEnd,
      };
    } catch (err) {
      if (isStrictDbMode()) {
        safeLogger.error('[Store] Prisma getDashboardStats FAILED in strict DB mode — throwing upward (HTTP 503 expected):', err);
        const wrapped = new Error(
          `[Store:strict] Postgres unreachable in strict DB mode (getDashboardStats). Set PACTOPUS_ALLOW_DEMO_STORE_FALLBACK=1 to permit local JSON demo fallbacks. Cause: ${(err as Error)?.message || String(err)}`
        );
        wrapped.name = 'StoreStrictDbError';
        throw wrapped;
      }
      safeLogger.warn('[Store] Prisma getDashboardStats aggregation failed, fallback local:', err);
    }
  }

  const all = await getAllInvoices(network, normalizedOwner);
  const paid = all.filter((i) => i.status === 'paid');
  const pending = all.filter((i) => i.status === 'pending');

  let totalEarnedUSDCUnits = BigInt(0);
  let totalEarnedEURCUnits = BigInt(0);
  for (const inv of paid) {
    if (inv.currency === 'USDC') totalEarnedUSDCUnits = safeAddUnits(totalEarnedUSDCUnits, inv.amount);
    else if (inv.currency === 'EURC') totalEarnedEURCUnits = safeAddUnits(totalEarnedEURCUnits, inv.amount);
  }

  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  const paidThisMonth = paid.filter(
    (i) => i.paidAt && new Date(i.paidAt).getTime() >= thisMonth.getTime()
  );
  let monthUSDCUnits = BigInt(0);
  let monthEURCUnits = BigInt(0);
  for (const inv of paidThisMonth) {
    if (inv.currency === 'USDC') monthUSDCUnits = safeAddUnits(monthUSDCUnits, inv.amount);
    else if (inv.currency === 'EURC') monthEURCUnits = safeAddUnits(monthEURCUnits, inv.amount);
  }

  return {
    totalInvoices: all.length,
    paidInvoices: paid.length,
    pendingInvoices: pending.length,
    totalEarnedUSDC: unitsToDecimalString(totalEarnedUSDCUnits, 6),
    totalEarnedEURC: unitsToDecimalString(totalEarnedEURCUnits, 6),
    earningsThisMonth: unitsToDecimalString(monthUSDCUnits, 6),
    earningsThisMonthUSDC: unitsToDecimalString(monthUSDCUnits, 6),
    earningsThisMonthEURC: unitsToDecimalString(monthEURCUnits, 6),
    recentInvoices: all.slice(0, 100),
    tier: usage.tier,
    invoicesUsedThisMonth: usage.invoicesUsed,
    invoicesAllowedThisMonth: usage.invoicesAllowed,
    billingCycleStart: usage.billingCycleStart,
    billingCycleEnd: usage.billingCycleEnd,
  };
}
