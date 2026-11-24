export const SECRET_ENV_NAMES: string[] = [
  "DATABASE_URL",
  "DIRECT_DATABASE_URL",
  "ARC_AGENT_PRIVATE_KEY",
  "PAYMASTER_SIGNER_KEY",
  "PAYMASTER_MIN_ALLOWANCE_RAW",
  "PAYMASTER_DAILY_BUDGET_RAW",
  "CIRCLE_API_KEY",
  "CIRCLE_ENTITY_SECRET",
  "CIRCLE_WEBHOOK_SIGNING_SECRET",
  "TEST_API_KEY",
];

export const PUBLIC_ENV_SAFELIST: string[] = [
  "NEXT_PUBLIC_SOLANA_CLUSTER",
  "NEXT_PUBLIC_SOLANA_RPC_URL",
  "NEXT_PUBLIC_SOLANA_EXPLORER_URL",
  "NEXT_PUBLIC_SOLANA_USDC_MINT",
  "NEXT_PUBLIC_SOLANA_EURC_MINT",
  "NEXT_PUBLIC_SOLANA_TREASURY",
  "NEXT_PUBLIC_SOLANA_PLATFORM_WALLET",
  "NEXT_PUBLIC_SEEKER_GENESIS_COLLECTION_MINT",
  "NEXT_PUBLIC_DEFAULT_USD_TO_GBP",
  "NEXT_PUBLIC_DEFAULT_EUR_TO_GBP",
  "NEXT_PUBLIC_ANDROID_PACKAGE_NAME",
  "NEXT_PUBLIC_ANDROID_CERT_SHA256",
  "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
  "NEXT_PUBLIC_ALGO_PLATFORM_WALLET",
  "NEXT_PUBLIC_PLATFORM_WALLET",
  "NEXT_PUBLIC_USDC_ADDRESS",
  "NEXT_PUBLIC_EURC_ADDRESS",
  "NEXT_PUBLIC_ARC_RPC_URL",
  "NEXT_PUBLIC_ARC_EXPLORER_URL",
  "NEXT_PUBLIC_PAYMASTER_ADDRESS",
  "NEXT_PUBLIC_PACTOPUS_NAME",
  "NEXT_PUBLIC_PACTOPUS_TAGLINE",
];

export const SENSITIVE_ENV_NAMES: string[] = [
  ...SECRET_ENV_NAMES,
];

/** Default Devnet sample treasury address — MUST NOT be used on Solana Mainnet in production */
export const DEVNET_SAMPLE_SOLANA_TREASURY = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

const IS_BUILD_OR_CI_CONTEXT: boolean = Boolean(
  process.env.CI ||
    process.env.VERCEL ||
    process.env.GITHUB_ACTIONS ||
    process.env.NEXT_BUILD_ID ||
    process.env.NETLIFY ||
    process.env.RENDER
);

const MUST_HAVE_CRASH: string[] = [];

const MUST_HAVE_WARN: string[] = [
  "NEXT_PUBLIC_SOLANA_PLATFORM_WALLET",
  "DATABASE_URL",
];

const REMEDIATION_HINTS: Record<string, string> = {
  NEXT_PUBLIC_SOLANA_PLATFORM_WALLET: "set Kyrvyn Ltd Solana Base58 treasury public key — falls back to default devnet treasury when unset",
  NEXT_PUBLIC_SOLANA_RPC_URL: "set Helius / Triton / QuickNode Solana RPC URL for production throughput — defaults to public cluster RPC",
  NEXT_PUBLIC_SOLANA_CLUSTER: "set 'mainnet-beta' or 'devnet' (default: devnet)",
  DATABASE_URL: "set Neon PostgreSQL URL in Vercel env — feature downgrades to local storage if missing",
  DIRECT_DATABASE_URL: "Neon direct (non-pooler) endpoint for prisma migrate CLI — optional, falls back to DATABASE_URL",
  NEXT_PUBLIC_ANDROID_PACKAGE_NAME: "Android TWA package name for Solana Seeker dApp Store (default: uk.co.kyrvynltd.pactopus)",
  NEXT_PUBLIC_ANDROID_CERT_SHA256: "SHA-256 signing certificate fingerprint for /.well-known/assetlinks.json",
  NEXT_PUBLIC_PACTOPUS_NAME: "Optional public brand name override shown in browser title and nav (default: 'Pactopus')",
  NEXT_PUBLIC_PACTOPUS_TAGLINE: "Optional public tagline shown on the landing hero (default: 'Stablecoin invoicing. Settled.')",
  PACTOPUS_LOG_SQL: "Set to 1 to emit Prisma query logs in development. Default: off.",
  PACTOPUS_ENABLE_LEGACY_ARC_ROUTES: "Set to '1' only in legacy test harnesses to re-enable decommissioned /api/agent/* and /api/circle/* routes.",
  PACTOPUS_ALLOW_DEMO_STORE_FALLBACK: "🔐 FEATURE_GATE (default off). Set to '1' ONLY for judges/local dev without a Neon Postgres DATABASE_URL.",
};

function isPlaceholderValue(value: string | undefined): boolean {
  if (value === undefined || value === null) return true;
  const trimmed = String(value).trim();
  if (trimmed === "") return true;
  if (/your_private_key_here$/i.test(trimmed)) return true;
  return false;
}

export function checkMainnetTreasuryConfig(env: NodeJS.ProcessEnv = process.env): {
  ok: boolean;
  reason?: string;
} {
  const cluster = env.NEXT_PUBLIC_SOLANA_CLUSTER || env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
  const wallet = (
    env.NEXT_PUBLIC_SOLANA_TREASURY ||
    env.NEXT_PUBLIC_SOLANA_PLATFORM_WALLET ||
    ""
  ).trim();
  if (cluster === "mainnet-beta") {
    if (!wallet || wallet === DEVNET_SAMPLE_SOLANA_TREASURY) {
      return {
        ok: false,
        reason:
          "NEXT_PUBLIC_SOLANA_CLUSTER is 'mainnet-beta' but NEXT_PUBLIC_SOLANA_TREASURY / NEXT_PUBLIC_SOLANA_PLATFORM_WALLET is unset or still using the devnet sample address (7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU). Configure Kyrvyn Ltd's real Mainnet treasury public key.",
      };
    }
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
      return {
        ok: false,
        reason: "NEXT_PUBLIC_SOLANA_TREASURY must be a valid Solana Base58 public key (32-44 chars).",
      };
    }
  }
  return { ok: true };
}

export function isMainnetTreasuryConfiguredSafely(env: NodeJS.ProcessEnv = process.env): boolean {
  return checkMainnetTreasuryConfig(env).ok;
}

function validateStructure(name: string, value: string): string | null {
  switch (name) {
    case "NEXT_PUBLIC_SOLANA_TREASURY":
    case "NEXT_PUBLIC_SOLANA_PLATFORM_WALLET": {
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
        return `${name} must be a valid Solana Base58 public key (32-44 chars)`;
      }
      break;
    }
    case "NEXT_PUBLIC_USDC_ADDRESS":
    case "NEXT_PUBLIC_PLATFORM_WALLET": {
      if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
        return `${name} must be 0x-prefixed 40-char hex address (got ${value.length} chars)`;
      }
      break;
    }
    case "DATABASE_URL": {
      if (!value.startsWith("postgresql://")) {
        return "DATABASE_URL must start with postgresql://";
      }
      break;
    }
  }
  return null;
}

export function validateCriticalEnvs(opts?: { mode?: "strict" | "warn" }): void {
  const defaultMode: "strict" | "warn" =
    process.env.NODE_ENV === "production" ? "strict" : "warn";

  let effectiveMode: "strict" | "warn" = opts?.mode ?? defaultMode;

  if (IS_BUILD_OR_CI_CONTEXT && opts?.mode !== "strict") {
    effectiveMode = "warn";
  }

  const missingItems: Array<{ name: string; reason: string; severity: "blocker" | "warning" }> = [];

  for (const name of MUST_HAVE_CRASH) {
    const raw = process.env[name];
    if (isPlaceholderValue(raw)) {
      const hint = REMEDIATION_HINTS[name] ?? "set in environment";
      missingItems.push({ name, reason: `missing → ${hint}`, severity: "blocker" });
      continue;
    }
    const structErr = validateStructure(name, String(raw));
    if (structErr) {
      missingItems.push({ name, reason: `invalid → ${structErr}`, severity: "blocker" });
    }
  }

  for (const name of MUST_HAVE_WARN) {
    const raw = process.env[name];
    if (isPlaceholderValue(raw)) {
      const hint = REMEDIATION_HINTS[name] ?? "set in environment";
      missingItems.push({ name, reason: `missing → ${hint}`, severity: "warning" });
      continue;
    }
    const structErr = validateStructure(name, String(raw));
    if (structErr) {
      missingItems.push({ name, reason: `invalid → ${structErr}`, severity: "warning" });
    }
  }

  const mainnetGuard = checkMainnetTreasuryConfig(process.env);
  if (!mainnetGuard.ok && mainnetGuard.reason) {
    missingItems.push({
      name: "NEXT_PUBLIC_SOLANA_PLATFORM_WALLET",
      reason: mainnetGuard.reason,
      severity: process.env.NODE_ENV === "production" ? "blocker" : "warning",
    });
  }

  for (const name of ["DATABASE_URL", "NEXT_PUBLIC_SOLANA_PLATFORM_WALLET"]) {
    const raw = process.env[name];
    if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
      const structErr = validateStructure(name, String(raw));
      if (structErr && !missingItems.some((m) => m.name === name)) {
        missingItems.push({ name, reason: `invalid → ${structErr}`, severity: "warning" });
      }
    }
  }

  if (missingItems.length === 0) return;

  const blockers = missingItems.filter((m) => m.severity === "blocker");
  const warnings = missingItems.filter((m) => m.severity === "warning");
  const lines = missingItems.map(
    (m) => `  - [${m.severity.toUpperCase()}] ${m.name} ${m.reason}`
  );
  const message = `[envguard] ${missingItems.length} environment issue(s) (${blockers.length} blocker, ${warnings.length} warning):\n${lines.join("\n")}`;

  const onlyWarnings = blockers.length === 0;
  if (effectiveMode === "strict" && !onlyWarnings) {
    const err = new Error(message);
    err.name = "EnvGuardValidationError";
    throw err;
  }

  const prefix = "\x1b[33m[envguard] WARN:\x1b[0m";
  for (const m of missingItems) {
    console.warn(`${prefix} ${m.name} (${m.severity}): ${m.reason}`);
  }
}

export function getSafeEnvPublic(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("NEXT_PUBLIC_")) {
      const val = process.env[key];
      if (val !== undefined) {
        out[key] = val;
      }
    }
  }
  return out;
}
