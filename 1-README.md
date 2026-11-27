# Pactopus — Solana Seeker dApp & Non-Custodial Stablecoin Invoicing

Pactopus is a non-custodial stablecoin invoicing and Solana Pay / Blinks checkout app for Solana, with an optional lower fee rate for payers who hold a Seeker Genesis Token. Create `USDC` or `EURC` invoices, share a payment link or QR code, and the payer sends the net amount to the recipient and the platform fee to the company wallet in a single transaction. Status: prototype. Not tested with a real wallet, on mainnet or on a device; see "Status and limits" below.

> Developed and owned by **[Kyrvyn Ltd](https://kyrvynltd.co.uk)** (`contact@kyrvynltd.co.uk` / `info@kyrvynltd.co.uk`)  
> Non-custodial Solana SPL stablecoin invoicing, a payer-held Seeker Genesis Token fee tier, settlement-state tracking, deterministic Reference Key recovery, and invoice records with CSV export.

---

## Fee model (new invoices)

The client pays the fee on top of the invoice amount. The recipient receives the full invoiced amount. There is one fee per invoice, taken in the same transaction.

| Payer | Fee | Cap |
| :--- | :--- | :--- |
| Standard (any Solana wallet) | 0.50% | £50 equivalent |
| Verified Seeker payer (the paying wallet signed the request and holds a Seeker Genesis Token) | 0.25% | £5 equivalent |

Notes:
- A Seeker Genesis Token in the paying wallet is not proof of the phone. The token can move between a user's own accounts, and the app does not track mint reuse. The discount follows the signed paying wallet at the time of payment.
- A bare QR or wallet request has no signature and is quoted the standard rate.
- Invoices created before this model keep their original deduct-from-recipient (`deduct-v1`) calculation.
- Whether a pilot waives the fee is not decided. Pricing here is the current code behaviour, not a published offer.

---

## Octopus Chameleon Narrative & Top Solana dApp UI/UX

Inspired by the **octopus’s chromatophore adaptation** and visual patterns from leading Solana ecosystem products (**Jupiter**, **Phantom**, **Tensor**, **Dialect Blinks**, **Helius**, and **Solana Seeker industrial hardware**):

1. **Standard and Seeker themes (`solana` ⇄ `seeker`)**:
   - **Solana Web Mode**: Deep Ultraviolet (`#9945FF`) & Cyber Teal (`#00D1FF`) glassmorphism.
   - **Seeker theme** (a visual theme only; it does not verify hardware): Seeker Obsidian (`#06090e`), Biometric Seed Vault Emerald (`#14F195`), and anodized Amber (`#F59E0B`).
   - All light and dark palettes are verified against WCAG AA contrast ratios via `npm run audit:contrast`.
2. **Jupiter-Style Atomic SPL Split & Cap Breakdown**:
   - Every checkout previews the atomic route (the transaction may also create token accounts and carries a memo):
     `Payer → [Payee SPL ATA (Net) + Kyrvyn Treasury ATA (Capped Fee) + SPL Memo + Reference Key]`
3. **6-State Settlement Telemetry & Reference Key Recovery**:
   - Tracks every invoice across:
     `Requested → Authorised → Submitted → Confirmed → Allocated → Accounted`
   - Each invoice derives a deterministic 32-byte **Solana Pay Reference Public Key** (`deriveInvoiceReferencePubkey`) and an immutable **SPL Memo** (`PACTOPUS:INV:<id>:GBP:<amount>`), allowing one-click on-chain recovery (`findSolanaSignatureByReference`) even if a client pays from a mobile QR scanner or closes their browser tab.
4. **Solana Pay Transaction Request & Dialect Blinks**:
   - `GET/POST /api/solana-pay/[id]`: Solana Pay Transaction Request specification endpoint.
   - `GET/POST /api/actions/pay/[id]` & `GET /actions.json`: Solana Actions & Shareable Blinks specification endpoints.
5. **GBP-valued invoice records**:
   - Stores a GBP valuation (`gbpRate`, `gbpAmount`, `gbpFee`, `gbpNetAmount`) at invoicing and settlement and offers a CSV export from `/dashboard`. This is a record aid only. It is not tax or accounting advice, and its fitness for any tax filing has not been reviewed.

---

## Cryptographic Security & Architecture

- **Native Node Crypto Ed25519 Verification**: Zero-dependency Ed25519 signature verification (`verifySolanaEd25519Signature` in `lib/solana.ts`) with single-use UUID nonce consumption (`lib/evm-nonce.ts`, DB table `AuthNonce`) protects authenticated endpoints against replay attacks.
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

## Status and limits

- Checked: unit and route tests, TypeScript, lint and a production build. A local Solana runtime test (in-process, throwaway keys, test mint) showed the transaction builder output executes and the settlement verifier rejects a wrong fee, recipient or reference.
- Not checked: any real wallet signature, devnet or mainnet payment, real RPC response parsing, any Android or Seeker device, the database migration `prisma/migrations/20261127160000_invoice_fee_model` (written, not run), a security review.
- Not available: a signed Android APK. The dApp Store config in `dapp-store/config.yaml` has publisher wallet, release address and certificate fingerprint left unset on purpose.
- Terms, privacy, VAT and regulatory position are unreviewed. Drafts in `docs-prep/legal` are not approved text.

---

© 2026 **[Kyrvyn Ltd](https://kyrvynltd.co.uk)** (`contact@kyrvynltd.co.uk` / `info@kyrvynltd.co.uk`). All rights reserved.
