# Pactopus

Pactopus is a multi-chain stablecoin invoicing platform for freelancers, studios, teams, and automated billing workflows. Create an invoice, share a payment link, and get paid in `USDC` or `EURC` on `Arc` or `Algorand` while the interface adapts its palette in milliseconds to match the active blockchain workspace.

> Developed and owned by **[Kyrvyn Ltd](https://kyrvynltd.co.uk)**  
> Non-custodial multi-chain invoicing with server-verified on-chain settlement, replay-protected wallet authentication, and programmatic HTTP 402 agent billing APIs.

## Why Pactopus Exists

Getting paid across different ecosystems is usually fragmented:

- Traditional invoicing is slow, charges `2.9% + fixed fees`, and is disconnected from on-chain settlement.
- Crypto payment tools often expose raw technical friction for everyday client work.
- Multi-chain products frequently split into separate experiences per network.

Pactopus unifies the experience:

- **One workflow** to draft, preview, and share invoices with optional expiration dates.
- **One dashboard** to track balances, monthly earnings per currency (`USDC` and `EURC`), and export CSV accounting reports.
- **One adaptive design system** that shifts colors in milliseconds to match `Arc` or `Algorand`.
- **Server-verified settlement** that checks both the recipient payout and platform fee on-chain before marking an invoice as paid.

## Core Capabilities

1. **Multi-Chain Invoice Creation (`Arc` & `Algorand`)**:
   - Supports `USDC` and `EURC` with 6-decimal `BigInt` precision.
   - Configurable invoice expiration (`7`, `14`, or `30` days, or no expiration) enforced server-side (`HTTP 410 Gone` when expired).
   - Smart Invoice Parser & Comms Assistant (`components/PactopusCopilot.tsx`) for rule-based plain-English parsing (`0x…` EVM and 58-char Algorand addresses) and Email/Slack/WhatsApp templates.
2. **Tiered Platform Fee Split & Subscription Plans**:
   - **The Solo Tide (Free)**: `0 USDC/mo`, `5` invoices/month, `0.5%` (`50 bps`) platform fee.
   - **The Reef Pro**: `15 USDC/mo (~£12)`, `10,000` invoices/month, `0.4%` (`40 bps`) platform fee, CSV export.
   - **The Armada Business**: `50 USDC/mo (~£40)`, `1,000,000` invoices/month, `0.3%` (`30 bps`) platform fee, HTTP 402 agent billing APIs.
3. **Cryptographic Wallet Authentication & Replay Protection**:
   - Write endpoints (`POST /api/invoices`, `GET /api/invoices`, `POST /api/pay`, `POST /api/circle/checkout`) require a single-use nonce (`GET /api/auth/nonce`) signed via EIP-191 (`personal_sign` on Arc/EVM) or Ed25519 (`algosdk.verifyBytes` via Pera Wallet on Algorand).
   - Atomic receipt claiming (`lib/receipt-claims.ts`) prevents transaction hash replay across invoices and subscriptions.
4. **Programmatic Agent Billing & Treasury Automation**:
   - `POST /api/agent/invoice-create`: Implements the **HTTP 402 Payment Required** nanopayment challenge (`0.05 USDC` on Arc), verifies the ERC-20 transfer on-chain, and creates the invoice.
   - `lib/agent-tools.ts`: Autonomous `createInvoiceTool` (handles HTTP 402 challenge-response) and `payInvoiceTool` (executes payout + fee split and submits signed receipt to `/api/pay`).
   - `POST /api/agent/treasury-sweep`: Operator-authenticated (`Authorization: Bearer $AGENT_ADMIN_TOKEN`) ERC-4626 vault sweeper requiring `ARC_YIELD_VAULT_ADDRESS`.
   - `POST /api/agent/demo-p2p`: Deterministic two-agent policy and fee-split simulation endpoint.

## Wallet Support

### Arc / EVM
- **MetaMask**
- **Coinbase Wallet**
- **Phantom (EVM mode)**
- **WalletConnect v2** (enabled when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is configured)

### Algorand
- **Pera Wallet** (authenticated via Ed25519 signed nonces and 2-transfer atomic ASA groups)

## Tech Stack

- **Framework**: Next.js 16 App Router (TypeScript, React 19)
- **Database**: PostgreSQL (Neon / standard Postgres) with Prisma ORM v7 (`@prisma/adapter-pg`)
- **State & Data Fetching**: TanStack Query v5
- **Blockchain SDKs**: Ethers.js v6, Algorand SDK v3 (`algosdk`), Pera Connect, Circle Developer-Controlled Wallets SDK
- **Styling & Accessibility**: Tokenized CSS design system with automated light/dark WCAG contrast auditing (`npm run audit:contrast`)

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

### Verification & Test Commands

```bash
npm run test:unit       # Node unit & security regression tests
npm run test:api        # Loopback HTTP negative auth & validation tests
npm run audit:contrast  # WCAG contrast ratio audit across light/dark themes
npm run lint            # ESLint zero-warning check
npm run build           # Production Next.js typecheck and bundle build
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
NEXT_PUBLIC_PACTOPUS_NAME=Pactopus
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# PostgreSQL persistence (required in production & for Algorand nonce replay store)
DATABASE_URL=
DIRECT_DATABASE_URL=

# Arc Testnet configuration
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.network
NEXT_PUBLIC_ARC_EXPLORER_URL=https://testnet.arcscan.app
NEXT_PUBLIC_USDC_ADDRESS=
NEXT_PUBLIC_EURC_ADDRESS=
NEXT_PUBLIC_PLATFORM_WALLET=

# Algorand Testnet configuration
NEXT_PUBLIC_ALGO_PLATFORM_WALLET=

# Optional WalletConnect v2 Project ID
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Circle Checkout & Developer-Controlled Wallets (optional)
CIRCLE_API_KEY=
CIRCLE_ENTITY_SECRET=
CIRCLE_WALLET_SET_ID=
CIRCLE_WEBHOOK_SIGNING_SECRET=

# Agent / Treasury operator settings (optional)
ARC_AGENT_PRIVATE_KEY=
AGENT_ADMIN_TOKEN=
ARC_YIELD_VAULT_ADDRESS=
```

`.env.example` documents every variable read by the application with safe empty defaults for secrets.

## Project Structure

```text
pactopus/
├── app/
│   ├── page.tsx                       # Chain-adaptive landing page & pricing
│   ├── onboarding/page.tsx            # Interactive 4-step stablecoin onboarding
│   ├── create/page.tsx                # Invoice creation form, live fee preview & Smart Parser
│   ├── pay/[id]/page.tsx              # Client payment page (Arc ERC-20 & Algorand atomic group)
│   ├── dashboard/page.tsx             # Wallet-scoped dashboard, CSV export & P2P policy simulator
│   └── api/
│       ├── auth/nonce/route.ts        # Single-use cryptographic challenge issuer
│       ├── invoices/route.ts          # Authenticated invoice list & creation
│       ├── invoices/[id]/route.ts     # Public invoice lookup with creator tier feeBps
│       ├── pay/route.ts               # Server-side on-chain payout + fee verification
│       ├── circle/checkout/route.ts   # Circle card checkout session creator
│       ├── circle/webhook/route.ts    # HMAC-verified Circle webhook handler
│       └── agent/                     # HTTP 402 invoice-create, treasury-sweep & demo-p2p
├── components/                        # Navbar, WalletModal, SubscriptionModal, PactopusCopilot, etc.
├── lib/                               # Settlement verifiers, auth, schemas, store, wallet provider
├── prisma/                            # Prisma schema, migrations & seed script
├── scripts/                           # Contrast auditor, loopback test runner & CLI P2P simulator
└── tests/                             # Unit, API, HTTP & Playwright browser test suites
```

## Algorand Testnet Payment Requirements

Algorand invoice creation and payment use Pera Wallet on Algorand TestNet. Configure `NEXT_PUBLIC_ALGO_PLATFORM_WALLET` with a valid 58-character TestNet address that has opted in to TestNet USDC (`10458941`) and EURC (`230190169`). Both the recipient and payer must be opted in to the invoice ASA. Payments execute as a 2-transfer atomic transaction group (net payout to recipient + platform fee to treasury) and are verified against the Algorand Indexer before marking the invoice as paid.

---

© 2026 [Kyrvyn Ltd](https://kyrvynltd.co.uk). All rights reserved.
