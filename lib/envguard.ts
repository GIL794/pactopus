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

const IS_BUILD_OR_CI_CONTEXT: boolean = Boolean(
  process.env.CI ||
    process.env.VERCEL ||
    process.env.GITHUB_ACTIONS ||
    process.env.NEXT_BUILD_ID ||
    process.env.NETLIFY ||
    process.env.RENDER
);

const MUST_HAVE_CRASH: string[] = [
  "NEXT_PUBLIC_USDC_ADDRESS",
  "NEXT_PUBLIC_PLATFORM_WALLET",
];

const MUST_HAVE_WARN: string[] = [
  "DATABASE_URL",
  "ARC_AGENT_PRIVATE_KEY",
  "CIRCLE_API_KEY",
  "CIRCLE_ENTITY_SECRET",
  "PAYMASTER_SIGNER_KEY",
  "CIRCLE_WEBHOOK_SIGNING_SECRET",
];

const REMEDIATION_HINTS: Record<string, string> = {
  DATABASE_URL: "set Neon PostgreSQL URL in Vercel env — feature downgrades to local storage if missing",
  DIRECT_DATABASE_URL: "Neon direct (non-pooler) endpoint for prisma migrate CLI — optional, falls back to DATABASE_URL",
  ARC_AGENT_PRIVATE_KEY: "export Arc agent 0x-prefixed private key from Coinbase AgentKit — treasury sweep skips when missing",
  CIRCLE_API_KEY: "generate Circle Developer-Controlled Wallets API key at https://console.circle.com — falls back to ethers local signer",
  CIRCLE_ENTITY_SECRET: "create Circle Entity Secret + RSA keypair per Circle docs — paired with CIRCLE_API_KEY",
  CIRCLE_WEBHOOK_SIGNING_SECRET: "HMAC sha256 secret generated in Circle Console Webhooks tab; validates X-Circle-Signature header on /api/circle/webhook",
  PAYMASTER_SIGNER_KEY: "0x-prefixed ECDSA private key that sponsors gas via paymaster — per-boot random signer used if missing",
  PAYMASTER_MIN_ALLOWANCE_RAW: "Minimum USDC-6 raw allowance (0-allowable) required before a user op qualifies for paymaster sponsorship. Default: 0.",
  PAYMASTER_DAILY_BUDGET_RAW: "Maximum USDC-6 raw spend per UTC day for paymaster sponsorship. Default: 1_000_000_000 (1000 USDC).",
  NEXT_PUBLIC_USDC_ADDRESS: "USDC token contract address (0x + 40 hex chars) on target chain",
  NEXT_PUBLIC_PLATFORM_WALLET: "Pactopus platform treasury address (0x + 40 hex chars, EVM-compatible) — 0.5% platform fee lands here",
  NEXT_PUBLIC_EURC_ADDRESS: "Optional EURC ERC-20 contract address; defaults to the documented Arc testnet EURC address when unset",
  NEXT_PUBLIC_ARC_RPC_URL: "Override Arc JSON-RPC URL — default: https://testnet.arc.eco/rpc",
  NEXT_PUBLIC_ARC_EXPLORER_URL: "Override Arc block explorer URL for tx links — default: https://explorer.arc.eco",
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "WalletConnect Cloud project ID from https://cloud.walletconnect.com — omit to disable WalletConnect",
  NEXT_PUBLIC_PAYMASTER_ADDRESS: "Override ERC-4337 Paymaster contract address; falls back to deterministic placeholder",
  NEXT_PUBLIC_ALGO_PLATFORM_WALLET: "Algorand base32 treasury address for platform fee on Algo axfers — falls back to demo value",
  NEXT_PUBLIC_PACTOPUS_NAME: "Optional public brand name override shown in browser title and nav (default: 'Pactopus')",
  NEXT_PUBLIC_PACTOPUS_TAGLINE: "Optional public tagline shown on the landing hero (default: 'Stablecoin invoicing. Settled.')",
  PACTOPUS_LOG_SQL: "Set to 1 to emit Prisma query logs in development. Default: off.",
  PACTOPUS_FORCE_CIRCLE_MOCK: "Set to 1 to enable mock-approve Circle flow in NODE_ENV=production deploys (judge previews without Circle creds).",
  PACTOPUS_DEMO_MODE: "Set to 'true' in scripts/demo-two-agent-p2p to disable DB writes. Default: false.",
  TEST_API_KEY: "Long random hex string used for internal smoke tests. Optional.",
  PACTOPUS_ALLOW_UNSAFE_PAYMASTER_SIGNER: "🔐 FEATURE_GATE (default off). Set to '1' ONLY in judge-demo preview deploys without a real PAYMASTER_SIGNER_KEY. Enables an in-memory ephemeral Wallet.createRandom() signer. NEVER enable on Vercel production main branch — sponsored gas signatures are unrecoverable after worker recycle.",
  PACTOPUS_ALLOW_DEMO_STORE_FALLBACK: "🔐 FEATURE_GATE (default off). Set to '1' ONLY for judges/local dev without a Neon Postgres DATABASE_URL. Allows lib/store.ts Prisma failures to fall back to in-memory/local JSON demo data instead of surfacing HTTP 503 Service Unavailable. NEVER enable on Vercel production — data lies about subscription tier + invoice counts.",
};

function isPlaceholderValue(value: string | undefined): boolean {
  if (value === undefined || value === null) return true;
  const trimmed = String(value).trim();
  if (trimmed === "") return true;
  if (/your_private_key_here$/i.test(trimmed)) return true;
  return false;
}

function validateStructure(name: string, value: string): string | null {
  switch (name) {
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
    case "ARC_AGENT_PRIVATE_KEY": {
      if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
        return "ARC_AGENT_PRIVATE_KEY must be 0x-prefixed 64-char hex private key";
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

  for (const name of ["DATABASE_URL", "ARC_AGENT_PRIVATE_KEY"]) {
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
