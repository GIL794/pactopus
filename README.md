# Pactopus — Solana Seeker dApp & Non-Custodial Stablecoin Invoicing

Pactopus is a non-custodial stablecoin invoicing, Solana Pay / Blinks checkout, and UK GBP reconciliation platform built for **Solana** and the **Solana Seeker Phone**. Create an unlimited number of `USDC` or `EURC` invoices at **no monthly subscription fee**, share a Solana Pay / Blink payment link, and settle atomically in `~400ms` while the **Octopus Chameleon UI** adapts its palette, typography, and fee engine between **Solana Web Mode** and **Solana Seeker Hardware Mode**.

> Developed and owned by **[Kyrvyn Ltd](https://kyrvynltd.co.uk)** (`contact@kyrvynltd.co.uk` / `info@kyrvynltd.co.uk`)  
> Non-custodial Solana SPL stablecoin invoicing with hardware-paired Seeker fee caps, 6-state settlement telemetry, deterministic Reference Key recovery, and locked-GBP accountant CSV exports.

---

## Pure Per-Transaction Fee & Cap Model (No Monthly Subscription Fee)

Instead of monthly SaaS subscriptions or artificial 5-invoice caps, Pactopus charges **£0/month with unlimited invoices** and takes a strictly capped micro-cut only when an invoice settles on-chain:

| Mode | Eligibility | Platform Fee | Hard Maximum Cap | £2,000 Invoice Fee | £10,000 Invoice Fee |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Solana Seeker Mode** (`data-network="seeker"`) | Verified Solana Seeker phone (Seed Vault MWA 2.0) or Seeker Genesis Token holder | **0.25% (`25 bps`)** | **£5.00 GBP Max Cap** | **£5.00** | **£5.00** (Cap Applied!) |
| **Standard Web Mode** (`data-network="solana"`) | Any Solana wallet on Web or Mobile (Phantom, Solflare, Backpack, Solana Pay QR) | **0.50% (`50 bps`)** | **£50.00 GBP Max Cap** | **£10.00** | **£50.00** (Cap Applied!) |

---

## Octopus Chameleon Narrative & Top Solana dApp UI/UX

Inspired by the **octopus’s chromatophore adaptation** and visual patterns from leading Solana ecosystem products (**Jupiter**, **Phantom**, **Tensor**, **Dialect Blinks**, **Helius**, and **Solana Seeker industrial hardware**):

1. **Chromatophore Hardware Pairing (`solana` ⇄ `seeker`)**:
   - **Solana Web Mode**: Deep Ultraviolet (`#9945FF`) & Cyber Teal (`#00D1FF`) glassmorphism.
   - **Solana Seeker Hardware Mode**: Seeker Obsidian (`#06090e`), Biometric Seed Vault Emerald (`#14F195`), and anodized Amber (`#F59E0B`).
   - All light and dark palettes are verified against WCAG AA contrast ratios via `npm run audit:contrast`.
2. **Jupiter-Style Atomic SPL Split & Cap Breakdown**:
   - Every checkout previews the exact 3-instruction atomic route:
     `Payer → [Payee SPL ATA (Net) + Kyrvyn Treasury ATA (Capped Fee) + SPL Memo + Reference Key]`
3. **6-State Settlement Telemetry & Reference Key Recovery**:
   - Tracks every invoice across:
     `Requested → Authorised → Submitted → Confirmed → Allocated → Accounted`
   - Each invoice derives a deterministic 32-byte **Solana Pay Reference Public Key** (`deriveInvoiceReferencePubkey`) and an immutable **SPL Memo** (`PACTOPUS:INV:<id>:GBP:<amount>`), allowing one-click on-chain recovery (`findSolanaSignatureByReference`) even if a client pays from a mobile QR scanner or closes their browser tab.
4. **Solana Pay Transaction Request & Dialect Blinks**:
   - `GET/POST /api/solana-pay/[id]`: Solana Pay Transaction Request specification endpoint.
   - `GET/POST /api/actions/pay/[id]` & `GET /actions.json`: Solana Actions & Shareable Blinks specification endpoints.
5. **UK Accountant GBP Locked-FX Reconciliation**:
   - Locks the GBP FX valuation (`gbpRate`, `gbpAmount`, `gbpFee`, `gbpNetAmount`) at invoicing/settlement and exports HMRC / Xero / FreeAgent-ready CSV reports from `/dashboard`.

---

## Cryptographic Security & Architecture

- **Native Node Crypto Ed25519 Verification**: Zero-dependency Ed25519 signature verification (`verifySolanaEd25519Signature` in `lib/solana.ts`) with single-use UUID nonce consumption (`lib/nonce-store.ts`) protects authenticated endpoints against replay attacks.
- **6-Decimal `BigInt` Integer Arithmetic**: Shared integer fee-splitting and GBP cap conversion (`splitSolanaAmount` in `lib/solana.ts` and `computeCappedInvoiceFeeGbp` in `lib/billing.ts`) eliminate floating-point drift between browser previews and server verification.
- **Atomic Receipt Claiming**: `lib/receipt-claims.ts` ensures a Solana transaction signature can never be replayed to settle multiple invoices.

---

## Tech Stack

- **Framework**: Next.js 16 App Router (TypeScript, React 19)
- **Typography**: `Space Grotesk` (Display), `Plus Jakarta Sans` (UI Body), `JetBrains Mono` (Tabular Amounts, Addresses & Telemetry)
- **Database**: PostgreSQL (Neon / standard Postgres) with Prisma ORM v7 (`@prisma/adapter-pg`)
- **State & Data Fetching**: TanStack Query v5
- **Solana & Multi-Chain Verification**: Native Ed25519 / JSON-RPC SPL Token Balance & Memo Verifier (`lib/solana.ts`, `lib/solana-payment.ts`, `lib/seeker.ts`), plus legacy compatibility adapters

---

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

### Verification & Test Commands

```bash
npm run test:unit       # Node unit, Solana/Seeker fee-cap & security regression tests
npm run audit:contrast  # WCAG contrast ratio audit across Solana, Seeker, Arc & Algorand themes
npx tsc --noEmit        # Strict TypeScript verification
npm run lint            # ESLint check
npm run build           # Production Next.js bundle build
```

---

© 2026 **[Kyrvyn Ltd](https://kyrvynltd.co.uk)** (`contact@kyrvynltd.co.uk` / `info@kyrvynltd.co.uk`). All rights reserved.
