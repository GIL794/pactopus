# Pactopus

Pactopus is a playful multi-chain invoicing app for freelancers, teams, and automation-friendly workflows. You create an invoice, share a link, and get paid in `USDC` or `EURC` on `Arc` or `Algorand` without learning a whole new product every time the chain changes.

The fun part: Pactopus behaves like an octopus. It changes its primary colors in milliseconds to match the blockchain workspace it is serving, while the core invoicing flow stays familiar and calm.

> Built by Gabriele Iacopo Langellotto, Kyrvyn Ltd  
> Hackathon MVP with a strong product-story layer, adaptive UI system, and experimental agentic billing routes

## Why Pactopus Exists

Getting paid across different ecosystems is usually messy:

- Traditional invoicing feels slow and disconnected from on-chain settlement
- Crypto payment tools often feel overly technical for normal client work
- Multi-chain products often split into completely different experiences per network

Pactopus tries to make that feel simple:

- One flow to create and share invoices
- One dashboard to track activity
- One product voice that stays approachable
- One adaptive interface that visually matches the chain you are using

## What The Product Does Today

Pactopus currently lets you:

1. Create invoices on Arc or Algorand
2. Get paid in `USDC` or `EURC`
3. Split payments automatically so the recipient gets `99.5%` and the platform gets `0.5%`
4. Verify payments server-side before marking invoices as paid
5. Switch between light and dark themes
6. Enable an optional OctoFun mode for milestone rewards

## The Octopus Metaphor, But Useful

The branding is not decorative. It maps directly to real product behavior:

| Octopus idea | Product behavior |
|---|---|
| Fast color adaptation | CSS variables update in milliseconds when the active chain changes |
| Many arms, one body | One product supports homepage, onboarding, invoice creation, payment, dashboard, and agent-facing APIs |
| Calm but clever | The app keeps the same payment journey even when branding and wallet context change |
| Playful without getting in the way | OctoFun is optional and rewards milestones without blocking work |

## Chain-Aware Themes

Pactopus uses document-level theme and network attributes to swap chain styling instantly.

### Arc Theme

Arc uses the following brand-aligned palette in the current implementation:

- Arc Teal: `#0070CC`
- Arc Black: `#000000`
- Arc Gray: `#6C757D`
- Arc Blue: `#0056B3`
- Arc Purple: `#6F42C1`
- Arc Orange: `#FD7E14`

### Algorand Theme

Algorand uses the following brand-aligned palette in the current implementation:

- Algorand Blue: `#0000FF`
- Algorand Black: `#000000`
- Algorand White: `#FFFFFF`
- Algorand Gray: `#6C757D`
- Algorand Light Blue: `#87CEEB`
- Algorand Green: `#2ECC71`
- Algorand Purple: `#9B59B6`

### What Actually Changes

- Colors, glows, badges, CTA gradients, and focus treatments adapt to the active chain
- Copy references the active chain in key places
- The invoice/payment flow itself does not fork into two separate products

## Core User Experience

### Homepage

- Explains the value proposition in plain language
- Shows chain-aware branding and pricing
- Links directly into onboarding or invoice creation

### Onboarding

- Walks new users through the product in a friendlier, less jargon-heavy tone
- Explains why stablecoin invoicing can feel faster and simpler than traditional alternatives

### Create Invoice

- Lets users set amount, currency, description, recipient address, and optional recipient name
- Shows a live summary and fee preview
- Validates addresses differently for Arc/EVM and Algorand

### Pay Invoice

- Loads an invoice from a shareable link
- Connects the right type of wallet
- Confirms payment on-chain before updating the invoice status

### Dashboard

- Lists recent invoices
- Shows balance and summary tiles
- Gives a quick view of paid vs pending activity

## Wallet Support

### Arc / EVM

- MetaMask
- Coinbase Wallet
- WalletConnect, only when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is configured

### Algorand

- Pera Wallet
- Injected Algorand wallets

If WalletConnect is not configured, the WalletConnect option is hidden instead of failing at runtime.

## OctoFun

OctoFun is an optional playful layer, toggled from the navbar with:

`🐙 toggle the octofun!`

When enabled, Pactopus shows celebratory milestone toasts for:

- First wallet connect
- First invoice created
- First payment completed
- First dashboard visit
- 30-day activity streak

OctoFun is intentionally lightweight:

- It is off by default
- It can be disabled any time
- It does not block critical actions
- It respects the broader accessibility and reduced-motion approach of the app

## Accessibility And Performance Work

The current implementation includes:

- Visible `:focus-visible` states for keyboard users
- Reduced-motion handling via `prefers-reduced-motion`
- Tokenized colors for centralized contrast control
- Automated light-theme contrast checks with `npm run audit:contrast`

Related documentation:
- Accessible high-contrast theming and design system tokens
- Responsive Arc and Algorand multi-chain routing specs

## Autonomous Agentic Capabilities

Pactopus natively equips automated scripts and AI agents with programmatic billing and liquidity management.

### HTTP 402 Invoice Creation

Route: `/api/agent/invoice-create`

- Returns `402 Payment Required` when the invoice creation nanopayment has not been made
- Verifies the Arc payment on-chain once a transaction hash is supplied
- Creates the invoice in the database after successful on-chain verification

### Agent Tools

File: `lib/agent-tools.ts`

- `createInvoiceTool`: Generates an invoice and handles the `402` payment retry flow autonomously
- `payInvoiceTool`: Executes payee payouts and platform fee splits on-chain

### DeFi Yield Sweeper

Route: `/api/agent/treasury-sweep`

- Monitors agent wallet float
- Retains an operational reserve balance (100 USDC)
- Sweeps excess USDC into an ERC-4626 yield-bearing vault on Arc L1

## Tech Stack

- Next.js 16 App Router (Turbopack, TypeScript)
- Neon PostgreSQL with Prisma ORM (`@prisma/adapter-pg`)
- Vanilla CSS with tokenized theming & particle physics
- TanStack Query (React Query v5)
- Ethers.js v6 & Algorand SDK
- Vercel Native Deployment Configuration

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

### Useful Commands

```bash
npm run dev
npm run build
npm run audit:contrast
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
NEXT_PUBLIC_PACTOPUS_NAME=Pactopus
NEXT_PUBLIC_PACTOPUS_TAGLINE=The octopus-inspired invoicing network that adapts its colors in milliseconds to the blockchain it serves.

# Required only if you want the WalletConnect option to appear
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Arc testnet configuration
NEXT_PUBLIC_ARC_RPC_URL=https://testnet.arc.eco/rpc
NEXT_PUBLIC_ARC_EXPLORER_URL=https://explorer.arc.eco
NEXT_PUBLIC_USDC_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
NEXT_PUBLIC_EURC_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
NEXT_PUBLIC_PLATFORM_WALLET=0x0000000000000000000000000000000000000001

# Used by the experimental agent/sweep routes
ARC_AGENT_PRIVATE_KEY=your_private_key_here
```

## Project Map

```text
pactopus/
├── app/
│   ├── page.tsx
│   ├── onboarding/page.tsx
│   ├── create/page.tsx
│   ├── pay/[id]/page.tsx
│   ├── dashboard/page.tsx
│   └── api/
├── components/
├── design-system/
├── docs/
├── lib/
├── db/
└── .env.example
```

## Documentation Guide

- Product overview and setup: `README.md`
- Design tokens and UI rules: `design-system/README.md`
- Palette decisions and contrast updates: `design-system/palette-adjustments.md`
- Accessibility and performance validation: `docs/accessibility-performance-audit.md`
- Usability testing kit: `docs/usability-testing.md`
- Synthetic example report: `docs/mock-usability-report.md`
- Technical handover: `DEVELOPER_LOG.md`
- Autonomous agentic architecture: `PACTOPUS_BLUEPRINT.md`

## Presentation

`presentation.html` contains a Reveal.js deck covering:

- The invoicing problem
- Arc and Algorand workspaces
- The adaptive octopus metaphor
- Programmatic HTTP 402 and yield sweep flows

---

Pactopus is built to feel memorable without becoming confusing: a little more fun than a typical fintech dashboard, but still serious where money is involved.

## Algorand Testnet payment requirements

Algorand invoice creation and payment require Pera Wallet on TestNet. Configure
`NEXT_PUBLIC_ALGO_PLATFORM_WALLET` with a real TestNet address that has opted in
to the chosen ASA. The recipient and payer must also have opted in to USDC or
EURC TestNet. A persistent `DATABASE_URL` plus the `AuthNonce` migration is
required for authenticated writes; without it the Algorand flow fails closed.
Never use the legacy unsigned `PACTOPUS_ALLOW_ALGORAND_WRITE_AUTH` flag: it does
not authenticate a wallet. Payments are a two-transfer atomic group (payout
and 0.5% fee); the server marks paid only after the Indexer sees both confirmed
transfers. Test with real Pera TestNet wallets and assets before public launch.
Other Algorand wallet options remain unsupported for authenticated writes. The
wallet and database integration still require an end-to-end TestNet acceptance
test before claiming that payments are ready for a public launch.
